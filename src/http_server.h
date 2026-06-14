#ifndef HTTP_SERVER_H
#define HTTP_SERVER_H

#include <stdint.h>

/**
 * Start HTTP Server Thread
 * @param port TCP Port
 * @return 0 on success, -1 on error
 */
int start_http_server_thread(uint16_t port);

/**
 * Update the shared XML status cache
 * @param xml_data The generated XML string
 * @param len The length of the string
 */
void update_http_status_cache(const char * xml_data, int len);

#endif
