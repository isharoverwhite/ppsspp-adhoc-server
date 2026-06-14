#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <fcntl.h>
#include <sys/types.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <errno.h>
#include <pthread.h>
#include "status.h"
#include "http_server.h"

// Define max buffer for XML output
#define XML_BUFFER_SIZE (1024 * 512)

// Shared Memory Buffer
static char * shared_xml_cache = NULL;
static int shared_xml_len = 0;
// We use a simple mutex to protect the shared cache
static pthread_mutex_t cache_mutex = PTHREAD_MUTEX_INITIALIZER;

/**
 * Enable Address Reuse on Socket
 */
static void enable_address_reuse_http(int fd)
{
	int on = 1;
	setsockopt(fd, SOL_SOCKET, SO_REUSEADDR, &on, sizeof(on));
}

/**
 * Update the shared XML status cache
 */
void update_http_status_cache(const char * xml_data, int len)
{
	pthread_mutex_lock(&cache_mutex);
	if(shared_xml_cache == NULL) {
		shared_xml_cache = (char *)malloc(XML_BUFFER_SIZE);
		if(shared_xml_cache != NULL) {
			memset(shared_xml_cache, 0, XML_BUFFER_SIZE);
		}
	}
	
	if(shared_xml_cache != NULL && xml_data != NULL && len < XML_BUFFER_SIZE) {
		memcpy(shared_xml_cache, xml_data, len);
		shared_xml_cache[len] = '\0';
		shared_xml_len = len;
	}
	pthread_mutex_unlock(&cache_mutex);
}

/**
 * Thread loop to handle HTTP connections
 */
static void * http_server_loop(void * arg)
{
	uint16_t port = (uint16_t)(uintptr_t)arg;
	
	int server_sock = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
	if(server_sock == -1) {
		printf("HTTP Thread: socket creation failed.\n");
		return NULL;
	}
	
	enable_address_reuse_http(server_sock);
	
	struct sockaddr_in local;
	memset(&local, 0, sizeof(local));
	local.sin_family = AF_INET;
	local.sin_addr.s_addr = INADDR_ANY;
	local.sin_port = htons(port);
	
	if(bind(server_sock, (struct sockaddr *)&local, sizeof(local)) == -1) {
		printf("HTTP Thread: bind failed.\n");
		close(server_sock);
		return NULL;
	}
	
	if(listen(server_sock, 128) == -1) {
		printf("HTTP Thread: listen failed.\n");
		close(server_sock);
		return NULL;
	}
	
	printf("Listening for HTTP API on TCP Port %u (Threaded).\n", port);
	
	while(1)
	{
		struct sockaddr_in client_addr;
		socklen_t addrlen = sizeof(client_addr);
		int client_sock = accept(server_sock, (struct sockaddr *)&client_addr, &addrlen);
		
		if(client_sock != -1)
		{
			char req_buffer[1024];
			memset(req_buffer, 0, sizeof(req_buffer));
			
			// Set timeout to prevent slowloris
			struct timeval tv;
			tv.tv_sec = 2;
			tv.tv_usec = 0;
			setsockopt(client_sock, SOL_SOCKET, SO_RCVTIMEO, (const char*)&tv, sizeof tv);
			setsockopt(client_sock, SOL_SOCKET, SO_SNDTIMEO, (const char*)&tv, sizeof tv);
			
			int recv_len = recv(client_sock, req_buffer, sizeof(req_buffer) - 1, 0);
			if(recv_len > 0)
			{
				if(strncmp(req_buffer, "GET ", 4) == 0)
				{
					pthread_mutex_lock(&cache_mutex);
					int current_len = shared_xml_len;
					char * local_copy = NULL;
					
					if(shared_xml_cache != NULL && current_len > 0) {
						local_copy = (char *)malloc(current_len + 1);
						if(local_copy != NULL) {
							memcpy(local_copy, shared_xml_cache, current_len);
							local_copy[current_len] = '\0';
						}
					}
					pthread_mutex_unlock(&cache_mutex);
					
					if(local_copy != NULL)
					{
						char headers[512];
						int header_len = snprintf(headers, sizeof(headers),
							"HTTP/1.1 200 OK\r\n"
							"Content-Type: application/xml; charset=utf-8\r\n"
							"Access-Control-Allow-Origin: *\r\n"
							"Content-Length: %d\r\n"
							"Connection: close\r\n\r\n", current_len);
						
						send(client_sock, headers, header_len, 0);
						send(client_sock, local_copy, current_len, 0);
						free(local_copy);
					}
					else
					{
						// Cache not ready yet
						const char * empty_resp = 
							"HTTP/1.1 200 OK\r\n"
							"Content-Type: application/xml; charset=utf-8\r\n"
							"Access-Control-Allow-Origin: *\r\n"
							"Content-Length: 75\r\n"
							"Connection: close\r\n\r\n"
							"<?xml version=\"1.0\" encoding=\"UTF-8\"?><prometheus usercount=\"0\"></prometheus>";
						send(client_sock, empty_resp, strlen(empty_resp), 0);
					}
				}
				else if(strncmp(req_buffer, "OPTIONS ", 8) == 0)
				{
					const char * options_resp = 
						"HTTP/1.1 204 No Content\r\n"
						"Access-Control-Allow-Origin: *\r\n"
						"Access-Control-Allow-Methods: GET, OPTIONS\r\n"
						"Access-Control-Allow-Headers: *\r\n"
						"Connection: close\r\n\r\n";
					send(client_sock, options_resp, strlen(options_resp), 0);
				}
				else
				{
					const char * bad_response = "HTTP/1.1 405 Method Not Allowed\r\n"
												"Access-Control-Allow-Origin: *\r\n"
												"Connection: close\r\n\r\n";
					send(client_sock, bad_response, strlen(bad_response), 0);
				}
			}
			close(client_sock);
		}
	}
	
	close(server_sock);
	return NULL;
}

/**
 * Start HTTP Server Thread
 */
int start_http_server_thread(uint16_t port)
{
	pthread_t thread_id;
	if(pthread_create(&thread_id, NULL, http_server_loop, (void *)(uintptr_t)port) != 0)
	{
		printf("Failed to create HTTP server thread.\n");
		return -1;
	}
	
	// Detach thread to avoid memory leak
	pthread_detach(thread_id);
	return 0;
}
