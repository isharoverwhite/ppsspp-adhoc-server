/*
 * This file is part of PRO ONLINE.

 * PRO ONLINE is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.

 * PRO ONLINE is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with PRO ONLINE. If not, see <http://www.gnu.org/licenses/ .
 */

#include <stdio.h>
#include <string.h>
#include <signal.h>
#include <unistd.h>
#include <poll.h>
#include <time.h>

#if !defined(__APPLE__)
#include <malloc.h>
#endif

#include <sys/types.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <fcntl.h>
#include <errno.h>
#include <config.h>
#include <user.h>
#include <status.h>
#include <http_server.h>
#include <stdlib.h>

// Server Status
int _status = 0;

// Server Configuration (with env override support)
uint16_t _server_port = SERVER_PORT;
uint32_t _server_max_users = SERVER_USER_MAXIMUM;
uint32_t _server_max_users_per_ip = SERVER_IP_MAXIMUM;
uint32_t _server_timeout = SERVER_USER_TIMEOUT;
const char * _server_database = SERVER_DATABASE;
const char * _server_status_path = SERVER_STATUS_XMLOUT;

// Control Configuration
uint16_t _control_port = 27313;

// HTTP API Configuration
uint16_t _http_port = 8080;

// Function Prototypes
void interrupt(int sig);
void load_env_config(void);
void enable_address_reuse(int fd);
void change_blocking_mode(int fd, int nonblocking);
int create_listen_socket(uint16_t port);
int create_control_socket(uint16_t port);
int server_loop(int server, int control);

/**
 * Server Entry Point
 * @param argc Number of Arguments
 * @param argv Arguments
 * @return OS Error Code
 */
int main(int argc, char * argv[])
{
	// Result
	int result = 0;

	// Don't buffer output to console
	setbuf(stdout, NULL);

	// Create Signal Receiver for CTRL + C
	signal(SIGINT, interrupt);
	
	// Create Signal Receiver for kill / killall
	signal(SIGTERM, interrupt);
	
	// Ignore SIGPIPE when client disconnects
	signal(SIGPIPE, SIG_IGN);
	
	// Load Configuration from Environment Variables
	load_env_config();
	
	// Validate Database
	validate_database();
	
	// Create Listening Socket
	int server = create_listen_socket(_server_port);
	
	// Create Control Socket (UDP)
	int control = create_control_socket(_control_port);
	
	// Start HTTP Server on separate thread
	start_http_server_thread(_http_port);
	
	// Created Listening Socket
	if(server != -1)
	{
		// Notify User
		printf("Listening for Connections on TCP Port %u.\n", _server_port);
		if(control != -1) printf("Listening for Admin Commands on UDP Port %u.\n", _control_port);
		
		// Enter Server Loop
		result = server_loop(server, control);
		
		// Notify User
		printf("Shutdown complete.\n");
	}
	
	// Return Result
	return result;
}

/**
 * Server Shutdown Request Handler
 * @param sig Captured Signal
 */
void interrupt(int sig)
{
	// Notify User
	printf("Shutting down... please wait.\n");
	
	// Trigger Shutdown
	_status = 0;
}

/**
 * Load Configuration from Environment Variables
 */
void load_env_config(void)
{
	// Load port from env
	const char * env_port = getenv("ADHOC_PORT");
	if(env_port != NULL)
	{
		uint16_t port = (uint16_t)atoi(env_port);
		if(port > 0) _server_port = port;
	}
	
	// Load max users from env
	const char * env_max_users = getenv("ADHOC_MAX_USERS");
	if(env_max_users != NULL)
	{
		uint32_t max_users = (uint32_t)atoi(env_max_users);
		if(max_users > 0 && max_users <= 4096) _server_max_users = max_users;
	}
	
	// Load max users per IP from env
	const char * env_max_users_per_ip = getenv("ADHOC_MAX_USERS_PER_IP");
	if(env_max_users_per_ip != NULL)
	{
		uint32_t max_users_ip = (uint32_t)atoi(env_max_users_per_ip);
		if(max_users_ip > 0) _server_max_users_per_ip = max_users_ip;
	}
	
	// Load timeout from env
	const char * env_timeout = getenv("ADHOC_TIMEOUT");
	if(env_timeout != NULL)
	{
		uint32_t timeout = (uint32_t)atoi(env_timeout);
		if(timeout > 0) _server_timeout = timeout;
	}
	
	// Log loaded config
	printf("Configuration:\n");
	printf("  Port: %u\n", _server_port);
	printf("  Max Users: %u\n", _server_max_users);
	printf("  Max Users Per IP: %u\n", _server_max_users_per_ip);
	printf("  Timeout: %u seconds\n", _server_timeout);
}

/**
 * Enable Address Reuse on Socket
 * @param fd Socket
 */
void enable_address_reuse(int fd)
{
	// Enable Value
	int on = 1;
	
	// Enable Port Reuse
	setsockopt(fd, SOL_SOCKET, SO_REUSEADDR, &on, sizeof(on));
}

/**
 * Change Socket Blocking Mode
 * @param fd Socket
 * @param nonblocking 1 for Nonblocking, 0 for Blocking
 */
void change_blocking_mode(int fd, int nonblocking)
{
	// Change to Non-Blocking Mode
	if(nonblocking) fcntl(fd, F_SETFL, O_NONBLOCK);

	// Change to Blocking Mode
	else
	{
		// Get Flags
		int flags = fcntl(fd, F_GETFL);

		// Remove Non-Blocking Flag
		fcntl(fd, F_SETFL, flags & ~O_NONBLOCK);
	}
}

/**
 * Create Port-Bound Listening Socket
 * @param port TCP Port
 * @return Socket Descriptor
 */
int create_listen_socket(uint16_t port)
{
	// Create Socket
	int fd = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
	
	// Created Socket
	if(fd != -1)
	{
		// Enable Address Reuse
		enable_address_reuse(fd);
		
		// Make Socket Nonblocking
		change_blocking_mode(fd, 1);
		
		// Prepare Local Address Information
		struct sockaddr_in local;
		memset(&local, 0, sizeof(local));
		local.sin_family = AF_INET;
		local.sin_addr.s_addr = INADDR_ANY;
		local.sin_port = htons(port);
		
		// Bind Local Address to Socket
		int bindresult = bind(fd, (struct sockaddr *)&local, sizeof(local));
		
		// Bound Local Address to Socket
		if(bindresult != -1)
		{
			// Switch Socket into Listening Mode
			listen(fd, SERVER_LISTEN_BACKLOG);
			
			// Return Socket
			return fd;
		}
		
		// Notify User
		else printf("%s: bind returned %d.\n", __func__, bindresult);
		
		// Close Socket
		close(fd);
	}
	
	// Notify User
	else printf("%s: socket returned %d.\n", __func__, fd);
	
	// Return Error
	return -1;
}

/**
 * Create UDP Control Socket
 * @param port UDP Port
 * @return Socket Descriptor
 */
int create_control_socket(uint16_t port)
{
	// Create Socket
	int fd = socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP);
	
	// Created Socket
	if(fd != -1)
	{
		// Enable Address Reuse
		enable_address_reuse(fd);
		
		// Make Socket Nonblocking
		change_blocking_mode(fd, 1);
		
		// Prepare Local Address Information
		struct sockaddr_in local;
		memset(&local, 0, sizeof(local));
		local.sin_family = AF_INET;
		local.sin_addr.s_addr = inet_addr("127.0.0.1"); // Only allow local commands
		local.sin_port = htons(port);
		
		// Bind Local Address to Socket
		int bindresult = bind(fd, (struct sockaddr *)&local, sizeof(local));
		
		// Bound Local Address to Socket
		if(bindresult != -1)
		{
			// Return Socket
			return fd;
		}
		
		// Notify User
		else printf("%s: bind returned %d.\n", __func__, bindresult);
		
		// Close Socket
		close(fd);
	}
	
	// Notify User
	else printf("%s: socket returned %d.\n", __func__, fd);
	
	// Return Error
	return -1;
}

/**
 * Server Main Loop
 * @param server Server Listening Socket
 * @param control Control UDP Socket
 * @return OS Error Code
 */
int server_loop(int server, int control)
{
	// Set Running Status
	_status = 1;
	
	// Create Empty Status Logfile
	update_status();
	
	// Handling Loop
	while(_status == 1)
	{
		// Prepare pollfd array using Variable Length Array
		struct pollfd fds[_server_max_users + 2];
		SceNetAdhocctlUserNode * fd_to_user[_server_max_users + 2];
		int nfds = 1;  // Start with server socket
		
		// Add server socket
		fds[0].fd = server;
		fds[0].events = POLLIN;
		fds[0].revents = 0;
		fd_to_user[0] = NULL;
		
		// Add control socket
		if(control != -1)
		{
			fds[nfds].fd = control;
			fds[nfds].events = POLLIN;
			fds[nfds].revents = 0;
			fd_to_user[nfds] = NULL;
			nfds++;
		}
		
		// Start index for users
		int user_start_index = nfds;
		
		// Add user sockets
		SceNetAdhocctlUserNode * user = _db_user;
		while(user != NULL && nfds < _server_max_users + 2)
		{
			fds[nfds].fd = user->stream;
			fds[nfds].events = POLLIN;
			if(user->tx_len > 0) fds[nfds].events |= POLLOUT;
			fds[nfds].revents = 0;
			fd_to_user[nfds] = user;
			nfds++;
			user = user->next;
		}
		
		// Poll with 1000ms timeout
		int poll_result = poll(fds, nfds, 1000);
		
		// Handle poll errors
		if(poll_result == -1)
		{
			if(errno != EINTR) perror("poll");
			continue;
		}
		
		// Accept new connections
		if(fds[0].revents & POLLIN)
		{
			struct sockaddr_in addr;
			socklen_t addrlen = sizeof(addr);
			memset(&addr, 0, sizeof(addr));
			
			int loginresult = accept(server, (struct sockaddr *)&addr, &addrlen);
			if(loginresult != -1)
			{
				change_blocking_mode(loginresult, 1);
				login_user_stream(loginresult, addr.sin_addr.s_addr);
			}
		}
		
		// Handle Admin Commands (Control Socket)
		static time_t last_admin_cmd_time = 0;
		if(control != -1)
		{
			// Control is always fds[1] if it exists
			if(fds[1].revents & POLLIN)
			{
				uint8_t ctrl_buf[1024];
				int ctrl_len = recv(control, ctrl_buf, sizeof(ctrl_buf), 0);
				
				time_t current_time = time(NULL);
				// Rate Limiting: Max 1 command per second
				if(current_time - last_admin_cmd_time >= 1)
				{
					if(ctrl_len >= 1)
					{
						uint8_t type = ctrl_buf[0];
						if(type == 1 && ctrl_len >= 2) // Global Broadcast
						{
							char msg[65];
							memset(msg, 0, sizeof(msg));
							int msg_len = ctrl_len - 1;
							if(msg_len > 64) msg_len = 64;
							memcpy(msg, ctrl_buf + 1, msg_len);
							printf("Admin Global Broadcast: %s\n", msg);
							spread_message(NULL, msg);
						}
						else if(type == 2 && ctrl_len >= 11) // Game Broadcast (1 byte type + 9 bytes game id + msg)
						{
							char game[10];
							memset(game, 0, sizeof(game));
							memcpy(game, ctrl_buf + 1, 9);
							
							char msg[65];
							memset(msg, 0, sizeof(msg));
							int msg_len = ctrl_len - 10;
							if(msg_len > 64) msg_len = 64;
							memcpy(msg, ctrl_buf + 10, msg_len);
							
							printf("Admin Game Broadcast (%s): %s\n", game, msg);
							spread_game_message(game, msg);
						}
					}
					last_admin_cmd_time = current_time;
				}
				else
				{
					// Dropped due to rate limit
					printf("Dropped UDP Control Packet (Rate Limit Exceeded)\n");
				}
			}
		}
		
		// Process user sockets
		for(int i = user_start_index; i < nfds; i++)
		{
			user = fd_to_user[i];
			if(user == NULL) continue;
			
			// Handle read
			if(fds[i].revents & POLLIN)
			{
				int recvresult = recv(user->stream, user->rx + user->rxpos, sizeof(user->rx) - user->rxpos, 0);
				
				// Connection Closed
				if(recvresult == 0 || (recvresult == -1 && errno != EAGAIN && errno != EWOULDBLOCK))
				{
					logout_user(user);
					continue;
				}
				
				// Received Data
				if(recvresult > 0)
				{
					user->rxpos += recvresult;
					user->last_recv = time(NULL);
				}
				
				// Process complete packets
				uint32_t last_rxpos = 0;
				while(user->rxpos > 0 && user->rxpos != last_rxpos)
				{
					last_rxpos = user->rxpos;
					
					// Waiting for Login Packet
					if(get_user_state(user) == USER_STATE_WAITING)
					{
						if(user->rx[0] == OPCODE_LOGIN)
						{
							if(user->rxpos >= sizeof(SceNetAdhocctlLoginPacketC2S))
							{
								SceNetAdhocctlLoginPacketC2S packet = *(SceNetAdhocctlLoginPacketC2S *)user->rx;
								clear_user_rxbuf(user, sizeof(SceNetAdhocctlLoginPacketC2S));
								login_user_data(user, &packet);
							}
						}
						else
						{
							uint8_t * ip = (uint8_t *)&user->resolver.ip;
							printf("Invalid Opcode 0x%02X in Waiting State from %u.%u.%u.%u.\n", user->rx[0], ip[0], ip[1], ip[2], ip[3]);
							logout_user(user);
						}
					}
					// Logged-In User
					else if(get_user_state(user) == USER_STATE_LOGGED_IN)
					{
						if(user->rx[0] == OPCODE_PING)
						{
							clear_user_rxbuf(user, 1);
						}
						else if(user->rx[0] == OPCODE_CONNECT)
						{
							if(user->rxpos >= sizeof(SceNetAdhocctlConnectPacketC2S))
							{
								SceNetAdhocctlConnectPacketC2S * packet = (SceNetAdhocctlConnectPacketC2S *)user->rx;
								SceNetAdhocctlGroupName group = packet->group;
								clear_user_rxbuf(user, sizeof(SceNetAdhocctlConnectPacketC2S));
								connect_user(user, &group);
							}
						}
						else if(user->rx[0] == OPCODE_DISCONNECT)
						{
							clear_user_rxbuf(user, 1);
							disconnect_user(user);
						}
						else if(user->rx[0] == OPCODE_SCAN)
						{
							clear_user_rxbuf(user, 1);
							send_scan_results(user);
						}
						else if(user->rx[0] == OPCODE_CHAT)
						{
							if(user->rxpos >= sizeof(SceNetAdhocctlChatPacketC2S))
							{
								SceNetAdhocctlChatPacketC2S * packet = (SceNetAdhocctlChatPacketC2S *)user->rx;
								char message[64];
								memset(message, 0, sizeof(message));
								strncpy(message, packet->message, sizeof(message) - 1);
								clear_user_rxbuf(user, sizeof(SceNetAdhocctlChatPacketC2S));
								
								// Log chat to file
								FILE *f = fopen("/app/webapp/chat.log", "a");
								if(f) {
									time_t now = time(NULL);
									struct tm *t = localtime(&now);
									char timeStr[32];
									strftime(timeStr, sizeof(timeStr), "%Y-%m-%d %H:%M:%S", t);
									
									char safegamestr[10];
									memset(safegamestr, 0, sizeof(safegamestr));
									if (user->game != NULL) {
										strncpy(safegamestr, (char *)user->game->game.data, PRODUCT_CODE_LENGTH);
									} else {
										strcpy(safegamestr, "UNKNOWN");
									}
									
									fprintf(f, "[%s] [%s] %s: %s\n", timeStr, safegamestr, user->resolver.name.data, message);
									fclose(f);
								}
								
								spread_message(user, message);
							}
						}
						else
						{
							uint8_t * ip = (uint8_t *)&user->resolver.ip;
							printf("Invalid Opcode 0x%02X in Logged-In State from %s (MAC: %02X:%02X:%02X:%02X:%02X:%02X - IP: %u.%u.%u.%u).\n", user->rx[0], (char *)user->resolver.name.data, user->resolver.mac.data[0], user->resolver.mac.data[1], user->resolver.mac.data[2], user->resolver.mac.data[3], user->resolver.mac.data[4], user->resolver.mac.data[5], ip[0], ip[1], ip[2], ip[3]);
							logout_user(user);
						}
					}
				}
			}
			
			// Handle write (flush TX buffer)
			if(fds[i].revents & POLLOUT)
			{
				flush_user_txbuf(user);
			}
			
			// Handle errors
			if(fds[i].revents & (POLLERR | POLLHUP))
			{
				logout_user(user);
			}
		}
		
		// Check for user timeouts
		user = _db_user;
		while(user != NULL)
		{
			SceNetAdhocctlUserNode * next = user->next;
			if(get_user_state(user) == USER_STATE_TIMED_OUT)
			{
				logout_user(user);
			}
			user = next;
		}
		
		// Update status periodically if dirty
		static time_t last_status_update = 0;
		time_t now = time(NULL);
		if(is_status_dirty() && now - last_status_update >= 1)
		{
			update_status();
			last_status_update = now;
		}
	}
	
	// Free User Database Memory
	free_database();
	
	// Close Server Sockets
	close(server);
	if (control != -1) close(control);
	
	// Return Success
	return 0;
}
