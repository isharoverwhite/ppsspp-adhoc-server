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

#if !defined(__APPLE__)
#include <malloc.h>
#endif
#include <stdlib.h>
#include <stdio.h>
#include <string.h>
#include <ctype.h>
#include <unistd.h>
#include <sys/socket.h>
#include <errno.h>
#include <user.h>
#include <status.h>
#include <config.h>
#include <sqlite3.h>

// User Count
uint32_t _db_user_count = 0;

// User Database
SceNetAdhocctlUserNode * _db_user = NULL;

// Game Database
SceNetAdhocctlGameNode * _db_game = NULL;

/**
 * Helper to check if a nickname contains "ADMIN" (case-insensitive)
 */
static int contains_admin(const char *name) {
	if (!name) return 0;
	const char *admin = "admin";
	int admin_len = 5;
	int name_len = strlen(name);
	for (int i = 0; i <= name_len - admin_len; i++) {
		int match = 1;
		for (int j = 0; j < admin_len; j++) {
			if (tolower((unsigned char)name[i+j]) != admin[j]) {
				match = 0;
				break;
			}
		}
		if (match) return 1;
	}
	return 0;
}

/**
 * Send All Data to Socket (handles partial sends)
 * @param fd Socket Descriptor
 * @param data Data to send
 * @param len Length of data
 * @return Number of bytes sent, or -1 on error
 */
ssize_t send_all(int fd, const void * data, size_t len)
{
	const uint8_t * buf = (const uint8_t *)data;
	size_t total = 0;
	
	while(total < len)
	{
		ssize_t n = send(fd, buf + total, len - total, MSG_NOSIGNAL);
		
		if(n == -1)
		{
			if(errno == EAGAIN || errno == EWOULDBLOCK)
				break;
			return -1;
		}
		
		if(n == 0)
			break;
		
		total += n;
	}
	
	return total;
}

/**
 * Queue Data for Sending (uses TX buffer)
 * @param user User Node
 * @param data Data to queue
 * @param len Length of data
 */
void queue_send(SceNetAdhocctlUserNode * user, const void * data, size_t len)
{
	if(user == NULL || data == NULL || len == 0) return;
	
	uint32_t space = sizeof(user->tx) - user->tx_len;
	
	// If it doesn't fit, try to flush buffer first to make space
	if(len > space)
	{
		flush_user_txbuf(user);
		space = sizeof(user->tx) - user->tx_len;
	}
	
	// If it fits now, append and flush
	if(len <= space)
	{
		memcpy(user->tx + user->tx_len, data, len);
		user->tx_len += len;
		flush_user_txbuf(user);
	}
	else
	{
		// Buffer overflow (client too slow), fatal issue
		user->last_recv = 0; // Mark for disconnection
	}
}

/**
 * Flush TX Buffer (send queued data)
 * @param user User Node
 */
void flush_user_txbuf(SceNetAdhocctlUserNode * user)
{
	if(user == NULL || user->tx_len == 0) return;
	
	ssize_t sent = send_all(user->stream, user->tx, user->tx_len);
	
	if(sent == -1)
	{
		// Fatal socket error
		user->tx_len = 0;
		user->tx_head = 0;
		user->last_recv = 0; // Mark for disconnection
	}
	else if(sent == (ssize_t)user->tx_len)
	{
		user->tx_len = 0;
		user->tx_head = 0;
	}
	else if(sent > 0)
	{
		user->tx_len -= sent;
		memmove(user->tx, user->tx + sent, user->tx_len);
		user->tx_head = 0;
	}
}

/**
 * Login User into Database (Stream)
 * @param fd Socket
 * @param ip IP Address (Network Order)
 */
void login_user_stream(int fd, uint32_t ip)
{
	// Enough Space available
	if(_db_user_count < _server_max_users)
	{
		// Check IP Duplication
		SceNetAdhocctlUserNode * u = _db_user;
		uint32_t ip_count = 0;
		while(u != NULL)
		{
			if(u->resolver.ip == ip) ip_count++;
			u = u->next;
		}
		
		// IP Limit Check
		if(ip_count < _server_max_users_per_ip)
		{
			// Allocate User Node Memory
			SceNetAdhocctlUserNode * user = (SceNetAdhocctlUserNode *)malloc(sizeof(SceNetAdhocctlUserNode));
			
			// Allocated User Node Memory
			if(user != NULL)
			{
				// Clear Memory
				memset(user, 0, sizeof(SceNetAdhocctlUserNode));
				
				// Save Socket
				user->stream = fd;
				
				// Save IP
				user->resolver.ip = ip;
				
				// Link into User List
				user->next = _db_user;
				if(_db_user != NULL) _db_user->prev = user;
				_db_user = user;
				
				// Initialize Death Clock
				user->last_recv = time(NULL);
				
				// Notify User
				uint8_t * ipa = (uint8_t *)&user->resolver.ip;
				printf("New Connection from %u.%u.%u.%u.\n", ipa[0], ipa[1], ipa[2], ipa[3]);
				
				// Fix User Counter
				_db_user_count++;
				
				// Update Status Log
				update_status_dirty();
				
				// Exit Function
				return;
			}
		}
	}
		
	// Duplicate IP, Allocation Error or not enough space - Close Stream
	close(fd);
}

/**
 * Check if User is Banned by IP or MAC
 * @param ip IP Address
 * @param mac MAC Address
 * @return 1 if banned, 0 otherwise
 */
int check_is_banned(uint32_t ip, SceNetEtherAddr * mac)
{
	int is_banned = 0;
	sqlite3 * db = NULL;
	
	if(sqlite3_open(_server_database, &db) == SQLITE_OK)
	{
		sqlite3_exec(db, "PRAGMA synchronous = NORMAL; PRAGMA journal_mode = WAL;", NULL, NULL, NULL);
		char ip_str[16];
		uint8_t * ipa = (uint8_t *)&ip;
		snprintf(ip_str, sizeof(ip_str), "%u.%u.%u.%u", ipa[0], ipa[1], ipa[2], ipa[3]);
		
		char mac_str[18];
		if(mac != NULL) {
			snprintf(mac_str, sizeof(mac_str), "%02X:%02X:%02X:%02X:%02X:%02X", 
				mac->data[0], mac->data[1], mac->data[2], mac->data[3], mac->data[4], mac->data[5]);
		} else {
			mac_str[0] = '\0';
		}
		
		sqlite3_stmt * stmt = NULL;
		const char * sql = "SELECT id FROM Ban WHERE ip = ? OR mac = ? LIMIT 1";
		if(sqlite3_prepare_v2(db, sql, -1, &stmt, NULL) == SQLITE_OK)
		{
			sqlite3_bind_text(stmt, 1, ip_str, -1, SQLITE_TRANSIENT);
			if(mac != NULL) {
				sqlite3_bind_text(stmt, 2, mac_str, -1, SQLITE_TRANSIENT);
			} else {
				sqlite3_bind_null(stmt, 2);
			}
			
			if(sqlite3_step(stmt) == SQLITE_ROW) {
				is_banned = 1;
			}
			sqlite3_finalize(stmt);
		}
		sqlite3_close(db);
	}
	
	return is_banned;
}

/**
 * Login User into Database (Login Data)
 * @param user User Node
 * @param data Login Packet
 */
void login_user_data(SceNetAdhocctlUserNode * user, SceNetAdhocctlLoginPacketC2S * data)
{
	// Product Code Check
	int valid_product_code = 1;
	
	// Iterate Characters
	int i = 0; for(; i < PRODUCT_CODE_LENGTH && valid_product_code == 1; i++)
	{
		// Valid Characters
		if(!((data->game.data[i] >= 'A' && data->game.data[i] <= 'Z') || (data->game.data[i] >= '0' && data->game.data[i] <= '9'))) valid_product_code = 0;
	}
	
	// Valid Packet Data
	if(valid_product_code == 1 && memcmp(&data->mac, "\xFF\xFF\xFF\xFF\xFF\xFF", sizeof(data->mac)) != 0 && memcmp(&data->mac, "\x00\x00\x00\x00\x00\x00", sizeof(data->mac)) != 0 && data->name.data[0] != 0 && !contains_admin((const char*)data->name.data))
	{
		// Check Ban Status
		if(check_is_banned(user->resolver.ip, &data->mac))
		{
			uint8_t * ip = (uint8_t *)&user->resolver.ip;
			printf("Connection Rejected: %s (MAC: %02X:%02X:%02X:%02X:%02X:%02X - IP: %u.%u.%u.%u) is banned.\n", 
				(char *)data->name.data, data->mac.data[0], data->mac.data[1], data->mac.data[2], 
				data->mac.data[3], data->mac.data[4], data->mac.data[5], ip[0], ip[1], ip[2], ip[3]);
			logout_user(user);
			return;
		}

		// Game Product Override
		game_product_override(&data->game);
		
		// MAC Deduplication: Kick existing session with same MAC
		SceNetAdhocctlUserNode * existing = _db_user;
		while(existing != NULL)
		{
			SceNetAdhocctlUserNode * next = existing->next;
			printf("DEBUG: existing MAC %02X:%02X:%02X:%02X:%02X:%02X, new MAC %02X:%02X:%02X:%02X:%02X:%02X\n",
				existing->resolver.mac.data[0], existing->resolver.mac.data[1], existing->resolver.mac.data[2], existing->resolver.mac.data[3], existing->resolver.mac.data[4], existing->resolver.mac.data[5],
				data->mac.data[0], data->mac.data[1], data->mac.data[2], data->mac.data[3], data->mac.data[4], data->mac.data[5]);
			// Only kick if MAC matches and it's a DIFFERENT socket (not the new one)
			if(existing != user && memcmp(&existing->resolver.mac, &data->mac, sizeof(SceNetEtherAddr)) == 0)
			{
				uint8_t * ip_old = (uint8_t *)&existing->resolver.ip;
				printf("Kicking old session of MAC %02X:%02X:%02X:%02X:%02X:%02X (IP: %u.%u.%u.%u) due to reconnect.\n",
					data->mac.data[0], data->mac.data[1], data->mac.data[2],
					data->mac.data[3], data->mac.data[4], data->mac.data[5],
					ip_old[0], ip_old[1], ip_old[2], ip_old[3]);
				logout_user(existing);
			}
			existing = next;
		}
		
		// Find existing Game
		SceNetAdhocctlGameNode * game = _db_game;
		while(game != NULL && strncmp(game->game.data, data->game.data, PRODUCT_CODE_LENGTH) != 0) game = game->next;
		
		// Game not found
		if(game == NULL)
		{
			// Allocate Game Node Memory
			game = (SceNetAdhocctlGameNode *)malloc(sizeof(SceNetAdhocctlGameNode));
			
			// Allocated Game Node Memory
			if(game != NULL)
			{
				// Clear Memory
				memset(game, 0, sizeof(SceNetAdhocctlGameNode));
				
				// Save Game Product ID
				game->game = data->game;
				
				// Link into Game List
				game->next = _db_game;
				if(_db_game != NULL) _db_game->prev = game;
				_db_game = game;
			}
		}
		
		// Game now available
		if(game != NULL)
		{
			// Save MAC
			user->resolver.mac = data->mac;
			
			// Save Nickname
			user->resolver.name = data->name;
			
			// Increase Player Count in Game Node
			game->playercount++;
			
			// Link Game to Player
			user->game = game;
			
			// Notify User
			uint8_t * ip = (uint8_t *)&user->resolver.ip;
			char safegamestr[10];
			memset(safegamestr, 0, sizeof(safegamestr));
			strncpy(safegamestr, game->game.data, PRODUCT_CODE_LENGTH);
			printf("%s (MAC: %02X:%02X:%02X:%02X:%02X:%02X - IP: %u.%u.%u.%u) started playing %s.\n", (char *)user->resolver.name.data, user->resolver.mac.data[0], user->resolver.mac.data[1], user->resolver.mac.data[2], user->resolver.mac.data[3], user->resolver.mac.data[4], user->resolver.mac.data[5], ip[0], ip[1], ip[2], ip[3], safegamestr);
			
			// Insert into PlayerHistory
			sqlite3 * db = NULL;
			if(sqlite3_open(_server_database, &db) == SQLITE_OK)
			{
				sqlite3_exec(db, "PRAGMA synchronous = NORMAL; PRAGMA journal_mode = WAL;", NULL, NULL, NULL);
				sqlite3_stmt * stmt = NULL;
				const char * sql = "INSERT INTO PlayerHistory (mac, ip, name, game, joinedAt) VALUES (?, ?, ?, ?, datetime('now'))";
				if(sqlite3_prepare_v2(db, sql, -1, &stmt, NULL) == SQLITE_OK)
				{
					char ip_str[16];
					snprintf(ip_str, sizeof(ip_str), "%u.%u.%u.%u", ip[0], ip[1], ip[2], ip[3]);
					char mac_str[18];
					snprintf(mac_str, sizeof(mac_str), "%02X:%02X:%02X:%02X:%02X:%02X", 
						user->resolver.mac.data[0], user->resolver.mac.data[1], user->resolver.mac.data[2], 
						user->resolver.mac.data[3], user->resolver.mac.data[4], user->resolver.mac.data[5]);
					
					sqlite3_bind_text(stmt, 1, mac_str, -1, SQLITE_TRANSIENT);
					sqlite3_bind_text(stmt, 2, ip_str, -1, SQLITE_TRANSIENT);
					sqlite3_bind_text(stmt, 3, (char *)user->resolver.name.data, -1, SQLITE_TRANSIENT);
					sqlite3_bind_text(stmt, 4, safegamestr, -1, SQLITE_TRANSIENT);
					
					sqlite3_step(stmt);
					sqlite3_finalize(stmt);
				}

				const char * sql_chat = "INSERT INTO ChatMessage (mac, name, game, \"group\", message, createdAt) VALUES ('SYSTEM', 'SYSTEM', 'GLOBAL', 'GLOBAL', ?, datetime('now'))";
				if(sqlite3_prepare_v2(db, sql_chat, -1, &stmt, NULL) == SQLITE_OK)
				{
					const char * gamename = find_cached_gamename(safegamestr);
					if(!gamename) gamename = safegamestr;
					
					char chat_msg[256];
					snprintf(chat_msg, sizeof(chat_msg), "🎮 %s vừa tham gia game %s!", (char *)user->resolver.name.data, gamename);
					sqlite3_bind_text(stmt, 1, chat_msg, -1, SQLITE_TRANSIENT);
					sqlite3_step(stmt);
					sqlite3_finalize(stmt);
					
					spread_message(NULL, chat_msg);
				}
				sqlite3_close(db);
			}
			
			// Update Status Log
			update_status_dirty();
			
			// Leave Function
			return;
		}
	}
	
	// Invalid Packet Data
	else
	{
		// Notify User
		uint8_t * ip = (uint8_t *)&user->resolver.ip;
		printf("Invalid Login Packet Contents from %u.%u.%u.%u.\n", ip[0], ip[1], ip[2], ip[3]);
	}
	
	// Logout User - Out of Memory or Invalid Arguments
	logout_user(user);
}

/**
 * Logout User from Database
 * @param user User Node
 */
void logout_user(SceNetAdhocctlUserNode * user)
{
	// Disconnect from Group
	if(user->group != NULL) disconnect_user(user);

	// Unlink Leftside (Beginning)
	if(user->prev == NULL) _db_user = user->next;
	
	// Unlink Leftside (Other)
	else user->prev->next = user->next;
	
	// Unlink Rightside
	if(user->next != NULL) user->next->prev = user->prev;
	
	// Close Stream
	close(user->stream);
	
	// Playing User
	if(user->game != NULL)
	{
		// Notify User
		uint8_t * ip = (uint8_t *)&user->resolver.ip;
		char safegamestr[10];
		memset(safegamestr, 0, sizeof(safegamestr));
		strncpy(safegamestr, user->game->game.data, PRODUCT_CODE_LENGTH);
		printf("%s (MAC: %02X:%02X:%02X:%02X:%02X:%02X - IP: %u.%u.%u.%u) stopped playing %s.\n", (char *)user->resolver.name.data, user->resolver.mac.data[0], user->resolver.mac.data[1], user->resolver.mac.data[2], user->resolver.mac.data[3], user->resolver.mac.data[4], user->resolver.mac.data[5], ip[0], ip[1], ip[2], ip[3], safegamestr);
		
		// Update PlayerHistory leftAt
		sqlite3 * db = NULL;
		if(sqlite3_open(_server_database, &db) == SQLITE_OK)
		{
			sqlite3_exec(db, "PRAGMA synchronous = NORMAL; PRAGMA journal_mode = WAL;", NULL, NULL, NULL);
			sqlite3_stmt * stmt = NULL;
			const char * sql = "UPDATE PlayerHistory SET leftAt = datetime('now') WHERE mac = ? AND leftAt IS NULL";
			if(sqlite3_prepare_v2(db, sql, -1, &stmt, NULL) == SQLITE_OK)
			{
				char mac_str[18];
				snprintf(mac_str, sizeof(mac_str), "%02X:%02X:%02X:%02X:%02X:%02X", 
					user->resolver.mac.data[0], user->resolver.mac.data[1], user->resolver.mac.data[2], 
					user->resolver.mac.data[3], user->resolver.mac.data[4], user->resolver.mac.data[5]);
				
				sqlite3_bind_text(stmt, 1, mac_str, -1, SQLITE_TRANSIENT);
				
				sqlite3_step(stmt);
				sqlite3_finalize(stmt);
			}

			const char * sql_chat = "INSERT INTO ChatMessage (mac, name, game, \"group\", message, createdAt) VALUES ('SYSTEM', 'SYSTEM', 'GLOBAL', 'GLOBAL', ?, datetime('now'))";
			if(sqlite3_prepare_v2(db, sql_chat, -1, &stmt, NULL) == SQLITE_OK)
			{
				const char * gamename = find_cached_gamename(safegamestr);
				if(!gamename) gamename = safegamestr;

				char chat_msg[256];
				snprintf(chat_msg, sizeof(chat_msg), "👋 %s đã rời game %s.", (char *)user->resolver.name.data, gamename);
				sqlite3_bind_text(stmt, 1, chat_msg, -1, SQLITE_TRANSIENT);
				sqlite3_step(stmt);
				sqlite3_finalize(stmt);
				
				spread_message(NULL, chat_msg);
			}
			sqlite3_close(db);
		}
		
		// Fix Game Player Count
		user->game->playercount--;
		
		// Empty Game Node
		if(user->game->playercount == 0)
		{
			// Unlink Leftside (Beginning)
			if(user->game->prev == NULL) _db_game = user->game->next;
			
			// Unlink Leftside (Other)
			else user->game->prev->next = user->game->next;
			
			// Unlink Rightside
			if(user->game->next != NULL) user->game->next->prev = user->game->prev;
			
			// Free Game Node Memory
			free(user->game);
		}
	}
	
	// Unidentified User
	else
	{
		// Notify User
		uint8_t * ip = (uint8_t *)&user->resolver.ip;
		printf("Dropped Connection to %u.%u.%u.%u.\n", ip[0], ip[1], ip[2], ip[3]);
	}
	
	// Free Memory
	free(user);
	
	// Fix User Counter
	_db_user_count--;
	
	// Update Status Log
	update_status_dirty();
}

/**
 * Free Database Memory
 */
void free_database(void)
{
	// There are users playing
	if(_db_user_count > 0)
	{
		// Send Shutdown Notice
		spread_message(NULL, SERVER_SHUTDOWN_MESSAGE);
	}
	
	// Iterate Users for Deletion
	SceNetAdhocctlUserNode * user = _db_user;
	while(user != NULL)
	{
		// Next User (for safe delete)
		SceNetAdhocctlUserNode * next = user->next;
		
		// Logout User
		logout_user(user);
		
		// Move Pointer
		user = next;
	}
}

/**
 * Connect User to Game Group
 * @param user User Node
 * @param group Group Name
 */
void connect_user(SceNetAdhocctlUserNode * user, SceNetAdhocctlGroupName * group)
{
	// Group Name Check
	int valid_group_name = 1;
	{
		// Iterate Characters
		int i = 0; for(; i < ADHOCCTL_GROUPNAME_LEN && valid_group_name == 1; i++)
		{
			// End of Name
			if(group->data[i] == 0) break;
			
			// A - Z
			if(group->data[i] >= 'A' && group->data[i] <= 'Z') continue;
			
			// a - z
			if(group->data[i] >= 'a' && group->data[i] <= 'z') continue;
			
			// 0 - 9
			if(group->data[i] >= '0' && group->data[i] <= '9') continue;
			
			// Invalid Symbol
			valid_group_name = 0;
		}
	}
	
	// Valid Group Name
	if(valid_group_name == 1)
	{
		// User is disconnected
		if(user->group == NULL)
		{
			// Find Group in Game Node
			SceNetAdhocctlGroupNode * g = user->game->group;
			while(g != NULL && strncmp((char *)g->group.data, (char *)group->data, ADHOCCTL_GROUPNAME_LEN) != 0) g = g->next;
			
			// BSSID Packet
			SceNetAdhocctlConnectBSSIDPacketS2C bssid;
			
			// Set BSSID Opcode
			bssid.base.opcode = OPCODE_CONNECT_BSSID;
			
			// Set Default BSSID
			bssid.mac = user->resolver.mac;
			
			// No Group found
			if(g == NULL)
			{
				// Allocate Group Memory
				g = (SceNetAdhocctlGroupNode *)malloc(sizeof(SceNetAdhocctlGroupNode));
				
				// Allocated Group Memory
				if(g != NULL)
				{
					// Clear Memory
					memset(g, 0, sizeof(SceNetAdhocctlGroupNode));
					
					// Link Game Node
					g->game = user->game;
					
					// Link Group Node
					g->next = g->game->group;
					if(g->game->group != NULL) g->game->group->prev = g;
					g->game->group = g;
					
					// Copy Group Name
					g->group = *group;
					
					// Increase Group Counter for Game
					g->game->groupcount++;
				}
			}
			
			// Group now available
			if(g != NULL)
			{
				// Iterate remaining Group Players
				SceNetAdhocctlUserNode * peer = g->player;
				while(peer != NULL)
				{
					// Connect Packet
					SceNetAdhocctlConnectPacketS2C packet;
					
					// Clear Memory
					// memset(&packet, 0, sizeof(packet));
					
					// Set Connect Opcode
					packet.base.opcode = OPCODE_CONNECT;
					
					// Set Player Name
					packet.name = user->resolver.name;
					
					// Set Player MAC
					packet.mac = user->resolver.mac;
					
					// Set Player IP
					packet.ip = user->resolver.ip;
					
					// Send Data
					queue_send(peer, &packet, sizeof(packet));
					
					// Set Player Name
					packet.name = peer->resolver.name;
					
					// Set Player MAC
					packet.mac = peer->resolver.mac;
					
					// Set Player IP
					packet.ip = peer->resolver.ip;
					
					// Send Data
					queue_send(user, &packet, sizeof(packet));
					
					// Set BSSID
					if(peer->group_next == NULL) bssid.mac = peer->resolver.mac;
					
					// Move Pointer
					peer = peer->group_next;
				}
				
				// Link User to Group
				user->group_next = g->player;
				if(g->player != NULL) g->player->group_prev = user;
				g->player = user;
				
				// Link Group to User
				user->group = g;
				
				// Increase Player Count
				g->playercount++;
				
				// Send Network BSSID to User
				queue_send(user, &bssid, sizeof(bssid));
				
				// Notify User
				uint8_t * ip = (uint8_t *)&user->resolver.ip;
				char safegamestr[10];
				memset(safegamestr, 0, sizeof(safegamestr));
				strncpy(safegamestr, user->game->game.data, PRODUCT_CODE_LENGTH);
				char safegroupstr[9];
				memset(safegroupstr, 0, sizeof(safegroupstr));
				strncpy(safegroupstr, (char *)user->group->group.data, ADHOCCTL_GROUPNAME_LEN);
				printf("%s (MAC: %02X:%02X:%02X:%02X:%02X:%02X - IP: %u.%u.%u.%u) joined %s group %s.\n", (char *)user->resolver.name.data, user->resolver.mac.data[0], user->resolver.mac.data[1], user->resolver.mac.data[2], user->resolver.mac.data[3], user->resolver.mac.data[4], user->resolver.mac.data[5], ip[0], ip[1], ip[2], ip[3], safegamestr, safegroupstr);

				sqlite3 * db = NULL;
				if(sqlite3_open(_server_database, &db) == SQLITE_OK)
				{
					sqlite3_exec(db, "PRAGMA synchronous = NORMAL; PRAGMA journal_mode = WAL;", NULL, NULL, NULL);
					sqlite3_stmt * stmt = NULL;
					const char * sql_chat = "INSERT INTO ChatMessage (mac, name, game, \"group\", message, createdAt) VALUES ('SYSTEM', 'SYSTEM', ?, ?, ?, datetime('now'))";
					if(sqlite3_prepare_v2(db, sql_chat, -1, &stmt, NULL) == SQLITE_OK)
					{
						const char * gamename = find_cached_gamename(safegamestr);
						if(!gamename) gamename = safegamestr;

						char chat_msg[256];
						snprintf(chat_msg, sizeof(chat_msg), "🤝 %s đã vào phòng %s", (char *)user->resolver.name.data, safegroupstr);
						sqlite3_bind_text(stmt, 1, gamename, -1, SQLITE_TRANSIENT);
						sqlite3_bind_text(stmt, 2, safegroupstr, -1, SQLITE_TRANSIENT);
						sqlite3_bind_text(stmt, 3, chat_msg, -1, SQLITE_TRANSIENT);
						sqlite3_step(stmt);
						sqlite3_finalize(stmt);
						
						spread_message(user, chat_msg);
					}
					sqlite3_close(db);
				}

				// Update Status Log
				update_status_dirty();
				
				// Exit Function
				return;
			}
		}
		
		// Already connected to another group
		else
		{
			// Notify User
			uint8_t * ip = (uint8_t *)&user->resolver.ip;
			char safegamestr[10];
			memset(safegamestr, 0, sizeof(safegamestr));
			strncpy(safegamestr, user->game->game.data, PRODUCT_CODE_LENGTH);
			char safegroupstr[9];
			memset(safegroupstr, 0, sizeof(safegroupstr));
			strncpy(safegroupstr, (char *)group->data, ADHOCCTL_GROUPNAME_LEN);
			char safegroupstr2[9];
			memset(safegroupstr2, 0, sizeof(safegroupstr2));
			strncpy(safegroupstr2, (char *)user->group->group.data, ADHOCCTL_GROUPNAME_LEN);
			printf("%s (MAC: %02X:%02X:%02X:%02X:%02X:%02X - IP: %u.%u.%u.%u) attempted to join %s group %s without disconnecting from %s first.\n", (char *)user->resolver.name.data, user->resolver.mac.data[0], user->resolver.mac.data[1], user->resolver.mac.data[2], user->resolver.mac.data[3], user->resolver.mac.data[4], user->resolver.mac.data[5], ip[0], ip[1], ip[2], ip[3], safegamestr, safegroupstr, safegroupstr2);
		}
	}
	
	// Invalid Group Name
	else
	{
		// Notify User
		uint8_t * ip = (uint8_t *)&user->resolver.ip;
		char safegamestr[10];
		memset(safegamestr, 0, sizeof(safegamestr));
		strncpy(safegamestr, user->game->game.data, PRODUCT_CODE_LENGTH);
		char safegroupstr[9];
		memset(safegroupstr, 0, sizeof(safegroupstr));
		strncpy(safegroupstr, (char *)group->data, ADHOCCTL_GROUPNAME_LEN);
		printf("%s (MAC: %02X:%02X:%02X:%02X:%02X:%02X - IP: %u.%u.%u.%u) attempted to join invalid %s group %s.\n", (char *)user->resolver.name.data, user->resolver.mac.data[0], user->resolver.mac.data[1], user->resolver.mac.data[2], user->resolver.mac.data[3], user->resolver.mac.data[4], user->resolver.mac.data[5], ip[0], ip[1], ip[2], ip[3], safegamestr, safegroupstr);
	}
	
	// Invalid State, Out of Memory or Invalid Group Name
	logout_user(user);
}

/**
 * Disconnect User from Game Group
 * @param user User Node
 */
void disconnect_user(SceNetAdhocctlUserNode * user)
{
	// User is connected
	if(user->group != NULL)
	{
		// Unlink Leftside (Beginning)
		if(user->group_prev == NULL) user->group->player = user->group_next;
		
		// Unlink Leftside (Other)
		else user->group_prev->group_next = user->group_next;
		
		// Unlink Rightside
		if(user->group_next != NULL) user->group_next->group_prev = user->group_prev;
		
		// Fix Player Count
		user->group->playercount--;
		
		// Iterate remaining Group Players
		SceNetAdhocctlUserNode * peer = user->group->player;
		while(peer != NULL)
		{
			// Disconnect Packet
			SceNetAdhocctlDisconnectPacketS2C packet;
			
			// Clear Memory
			// memset(&packet, 0, sizeof(packet));
			
			// Set Disconnect Opcode
			packet.base.opcode = OPCODE_DISCONNECT;
			
			// Set User IP
			packet.ip = user->resolver.ip;
			
			// Send Data
			queue_send(peer, &packet, sizeof(packet));
			
			// Move Pointer
			peer = peer->group_next;
		}
		
		// Notify User
		uint8_t * ip = (uint8_t *)&user->resolver.ip;
		char safegamestr[10];
		memset(safegamestr, 0, sizeof(safegamestr));
		strncpy(safegamestr, user->game->game.data, PRODUCT_CODE_LENGTH);
		char safegroupstr[9];
		memset(safegroupstr, 0, sizeof(safegroupstr));
		strncpy(safegroupstr, (char *)user->group->group.data, ADHOCCTL_GROUPNAME_LEN);
		printf("%s (MAC: %02X:%02X:%02X:%02X:%02X:%02X - IP: %u.%u.%u.%u) left %s group %s.\n", (char *)user->resolver.name.data, user->resolver.mac.data[0], user->resolver.mac.data[1], user->resolver.mac.data[2], user->resolver.mac.data[3], user->resolver.mac.data[4], user->resolver.mac.data[5], ip[0], ip[1], ip[2], ip[3], safegamestr, safegroupstr);
		
		// Empty Group
		if(user->group->playercount == 0)
		{
			// Unlink Leftside (Beginning)
			if(user->group->prev == NULL) user->group->game->group = user->group->next;
			
			// Unlink Leftside (Other)
			else user->group->prev->next = user->group->next;
			
			// Unlink Rightside
			if(user->group->next != NULL) user->group->next->prev = user->group->prev;
			
			// Free Group Memory
			free(user->group);
			
			// Decrease Group Counter in Game Node
			user->game->groupcount--;
		}
		
		// Unlink from Group
		user->group = NULL;
		user->group_next = NULL;
		user->group_prev = NULL;
		
		// Update Status Log
		update_status_dirty();
		
		// Exit Function
		return;
	}
	
	// Not in a game group
	else
	{
		// Notify User
		uint8_t * ip = (uint8_t *)&user->resolver.ip;
		char safegamestr[10];
		memset(safegamestr, 0, sizeof(safegamestr));
		strncpy(safegamestr, user->game->game.data, PRODUCT_CODE_LENGTH);
		printf("%s (MAC: %02X:%02X:%02X:%02X:%02X:%02X - IP: %u.%u.%u.%u) attempted to leave %s group without joining one first.\n", (char *)user->resolver.name.data, user->resolver.mac.data[0], user->resolver.mac.data[1], user->resolver.mac.data[2], user->resolver.mac.data[3], user->resolver.mac.data[4], user->resolver.mac.data[5], ip[0], ip[1], ip[2], ip[3], safegamestr);
	}
	
	// Delete User
	logout_user(user);
}

/**
 * Send Game Group List
 * @param user User Node
 */
void send_scan_results(SceNetAdhocctlUserNode * user)
{
	// User is disconnected
	if(user->group == NULL)
	{
		// Iterate Groups
		SceNetAdhocctlGroupNode * group = user->game->group;
		for(; group != NULL; group = group->next)
		{
			// Scan Result Packet
			SceNetAdhocctlScanPacketS2C packet;
			
			// Clear Memory
			// memset(&packet, 0, sizeof(packet));
			
			// Set Opcode
			packet.base.opcode = OPCODE_SCAN;
			
			// Set Group Name
			packet.group = group->group;
			
			// Iterate Players in Network Group
			SceNetAdhocctlUserNode * peer = group->player;
			for(; peer != NULL; peer = peer->group_next)
			{
				// Found Network Founder
				if(peer->group_next == NULL)
				{
					// Set Group Host MAC
					packet.mac = peer->resolver.mac;
				}
			}
			
			// Send Group Packet
			queue_send(user, &packet, sizeof(packet));
		}
		
		// Notify Player of End of Scan
		uint8_t opcode = OPCODE_SCAN_COMPLETE;
		queue_send(user, &opcode, 1);
		
		// Notify User
		uint8_t * ip = (uint8_t *)&user->resolver.ip;
		char safegamestr[10];
		memset(safegamestr, 0, sizeof(safegamestr));
		strncpy(safegamestr, user->game->game.data, PRODUCT_CODE_LENGTH);
		printf("%s (MAC: %02X:%02X:%02X:%02X:%02X:%02X - IP: %u.%u.%u.%u) requested information on %d %s groups.\n", (char *)user->resolver.name.data, user->resolver.mac.data[0], user->resolver.mac.data[1], user->resolver.mac.data[2], user->resolver.mac.data[3], user->resolver.mac.data[4], user->resolver.mac.data[5], ip[0], ip[1], ip[2], ip[3], user->game->groupcount, safegamestr);
		
		// Exit Function
		return;
	}
	
	// User in a game group
	else
	{
		// Notify User
		uint8_t * ip = (uint8_t *)&user->resolver.ip;
		char safegamestr[10];
		memset(safegamestr, 0, sizeof(safegamestr));
		strncpy(safegamestr, user->game->game.data, PRODUCT_CODE_LENGTH);
		char safegroupstr[9];
		memset(safegroupstr, 0, sizeof(safegroupstr));
		strncpy(safegroupstr, (char *)user->group->group.data, ADHOCCTL_GROUPNAME_LEN);
		printf("%s (MAC: %02X:%02X:%02X:%02X:%02X:%02X - IP: %u.%u.%u.%u) attempted to scan for %s groups without disconnecting from %s first.\n", (char *)user->resolver.name.data, user->resolver.mac.data[0], user->resolver.mac.data[1], user->resolver.mac.data[2], user->resolver.mac.data[3], user->resolver.mac.data[4], user->resolver.mac.data[5], ip[0], ip[1], ip[2], ip[3], safegamestr, safegroupstr);
	}
	
	// Delete User
	logout_user(user);
}

/**
 * Spread Chat Message in P2P Network
 * @param user Sender User Node
 * @param message Chat Message
 */
void spread_message(SceNetAdhocctlUserNode * user, const char * message)
{
	// Global Notice
	if(user == NULL)
	{
		// Iterate Players
		for(user = _db_user; user != NULL; user = user->next)
		{
			// Player has access to chat
			if(user->group != NULL)
			{
				// Chat Packet
				SceNetAdhocctlChatPacketS2C packet;
				
				// Clear Memory
				memset(&packet, 0, sizeof(packet));
				
				// Set Chat Opcode
				packet.base.base.opcode = OPCODE_CHAT;
				
				// Set Sender Name to SYSTEM
				strcpy((char *)packet.name.data, "SYSTEM");
				
				// Set Chat Message
				strcpy(packet.base.message, message);
				
				// Send Data
				queue_send(user, &packet, sizeof(packet));
			}
		}
		
		// Prevent NULL Error
		return;
	}
	
	// User is connected
	else if(user->group != NULL)
	{
		// Broadcast Range Counter
		uint32_t counter = 0;
		
		// Iterate Group Players
		SceNetAdhocctlUserNode * peer = user->group->player;
		while(peer != NULL)
		{
			// Skip Self
			if(peer == user)
			{
				// Move Pointer
				peer = peer->group_next;
				
				// Continue Loop
				continue;
			}
			
			// Chat Packet
			SceNetAdhocctlChatPacketS2C packet;
			
			// Set Chat Opcode
			packet.base.base.opcode = OPCODE_CHAT;
			
			// Set Chat Message
			strcpy(packet.base.message, message);
			
			// Set Sender Nickname
			packet.name = user->resolver.name;
			
			// Send Data
			queue_send(peer, &packet, sizeof(packet));
			
			// Move Pointer
			peer = peer->group_next;
			
			// Increase Broadcast Range Counter
			counter++;
		}
		
		// Message Sent
		if(counter > 0)
		{
			// Notify User
			uint8_t * ip = (uint8_t *)&user->resolver.ip;
			char safegamestr[10];
			memset(safegamestr, 0, sizeof(safegamestr));
			strncpy(safegamestr, user->game->game.data, PRODUCT_CODE_LENGTH);
			char safegroupstr[9];
			memset(safegroupstr, 0, sizeof(safegroupstr));
			strncpy(safegroupstr, (char *)user->group->group.data, ADHOCCTL_GROUPNAME_LEN);
			printf("%s (MAC: %02X:%02X:%02X:%02X:%02X:%02X - IP: %u.%u.%u.%u) sent \"%s\" to %d players in %s group %s.\n", (char *)user->resolver.name.data, user->resolver.mac.data[0], user->resolver.mac.data[1], user->resolver.mac.data[2], user->resolver.mac.data[3], user->resolver.mac.data[4], user->resolver.mac.data[5], ip[0], ip[1], ip[2], ip[3], message, counter, safegamestr, safegroupstr);
		}
		
		// Exit Function
		return;
	}
	
	// User not in a game group
	else
	{
		// Notify User
		uint8_t * ip = (uint8_t *)&user->resolver.ip;
		char safegamestr[10];
		memset(safegamestr, 0, sizeof(safegamestr));
		strncpy(safegamestr, user->game->game.data, PRODUCT_CODE_LENGTH);
		printf("%s (MAC: %02X:%02X:%02X:%02X:%02X:%02X - IP: %u.%u.%u.%u) attempted to send a text message without joining a %s group first.\n", (char *)user->resolver.name.data, user->resolver.mac.data[0], user->resolver.mac.data[1], user->resolver.mac.data[2], user->resolver.mac.data[3], user->resolver.mac.data[4], user->resolver.mac.data[5], ip[0], ip[1], ip[2], ip[3], safegamestr);
	}
	
	// Delete User
	logout_user(user);
}

/**
 * Get User State
 * @param user User Node
 */
int get_user_state(SceNetAdhocctlUserNode * user)
{
	// Timeout Status
	if((time(NULL) - user->last_recv) >= _server_timeout) return USER_STATE_TIMED_OUT;
	
	// Waiting Status
	if(user->game == NULL) return USER_STATE_WAITING;
	
	// Logged-In Status
	return USER_STATE_LOGGED_IN;
}

/**
 * Clear RX Buffer
 * @param user User Node
 * @param clear Number of Bytes to clear (-1 for all)
 */
void clear_user_rxbuf(SceNetAdhocctlUserNode * user, int clear)
{
	// Fix Clear Length
	if(clear == -1 || clear > user->rxpos) clear = user->rxpos;
	
	// Move Buffer
	memmove(user->rx, user->rx + clear, sizeof(user->rx) - clear);
	
	// Fix RX Buffer Pointer
	user->rxpos -= clear;
}

/**
 * Patch Game Product Code
 * @param product To-be-patched Product Code
 * @param from If the Product Code matches this...
 * @param to ... then change it to this one.
 */
void game_product_relink(SceNetAdhocctlProductCode * product, char * from, char * to)
{
	// Relink Region Code
	if(strncmp(product->data, from, PRODUCT_CODE_LENGTH) == 0) strncpy(product->data, to, PRODUCT_CODE_LENGTH);
}

/**
 * Game Product Override (used for mixing multi-region games)
 * @param product IN: Source Product OUT: Override Product
 */
void game_product_override(SceNetAdhocctlProductCode * product)
{
	// Invalid Arguments
	if(product == NULL) return;

	// Safe Product Code
	char productid[PRODUCT_CODE_LENGTH + 1];
	
	// Prepare Safe Product Code
	strncpy(productid, product->data, PRODUCT_CODE_LENGTH);
	productid[PRODUCT_CODE_LENGTH] = 0;
	
	// Check RAM Cache for Crosslinks first (Fast path)
	const char * crosslink = find_cached_crosslink(productid);
	if(crosslink != NULL)
	{
		// Crosslink Product Code
		strncpy(product->data, crosslink, PRODUCT_CODE_LENGTH);
		
		// Log Crosslink
		printf("Crosslinked %s to %s (from RAM).\n", productid, crosslink);
		
		// Exit Function
		return;
	}
	
	// Check if Product ID exists in RAM Cache
	if(is_productid_cached(productid))
	{
		// Already known, nothing to do
		return;
	}
	
	// If not in cache, we need to handle unknown game (Slow path - SQLite)
	// Database Handle
	sqlite3 * db = NULL;
	
	// Open Database
	if(sqlite3_open(_server_database, &db) == SQLITE_OK)
	{
		sqlite3_exec(db, "PRAGMA synchronous = NORMAL; PRAGMA journal_mode = WAL;", NULL, NULL, NULL);
		// Double check in DB just in case cache was loaded before this addition
		sqlite3_stmt * stmt = NULL;
		const char * sql_check = "SELECT id FROM productids WHERE id=?;";
		int exists = 0;
		
		if(sqlite3_prepare_v2(db, sql_check, -1, &stmt, NULL) == SQLITE_OK)
		{
			if(sqlite3_bind_text(stmt, 1, productid, strlen(productid), SQLITE_STATIC) == SQLITE_OK)
			{
				if(sqlite3_step(stmt) == SQLITE_ROW) exists = 1;
			}
			sqlite3_finalize(stmt);
		}
		
		if(!exists)
		{
			const char * sql_ins = "INSERT INTO productids(id, name) VALUES(?, ?);";
			if(sqlite3_prepare_v2(db, sql_ins, -1, &stmt, NULL) == SQLITE_OK)
			{
				if(sqlite3_bind_text(stmt, 1, productid, strlen(productid), SQLITE_STATIC) == SQLITE_OK && 
				   sqlite3_bind_text(stmt, 2, productid, strlen(productid), SQLITE_STATIC) == SQLITE_OK)
				{
					if(sqlite3_step(stmt) == SQLITE_DONE)
					{
						printf("Added Unknown Product ID %s to Database.\n", productid);
						// Also add to RAM cache so we don't hit SQLite again for this game
						add_to_productid_cache(productid, productid);
					}
				}
				sqlite3_finalize(stmt);
			}
		}
		else
		{
			// It exists in DB but not in cache? Add it to cache now.
			add_to_productid_cache(productid, productid);
		}
		
		sqlite3_close(db);
	}
}

/**
 * Spread Chat Message to all players in a specific game
 * @param game_name Target Game ID
 * @param message Chat Message
 */
void spread_game_message(const char * game_name, const char * message)
{
	if(game_name == NULL || message == NULL) return;
	
	SceNetAdhocctlUserNode * user = _db_user;
	for(; user != NULL; user = user->next)
	{
		if(user->group != NULL && user->game != NULL)
		{
			// Match Game
			if(strncmp((char *)user->game->game.data, game_name, PRODUCT_CODE_LENGTH) == 0)
			{
				SceNetAdhocctlChatPacketS2C packet;
				memset(&packet, 0, sizeof(packet));
				packet.base.base.opcode = OPCODE_CHAT;
				strcpy((char *)packet.name.data, "ADMIN");
				strcpy(packet.base.message, message);
				queue_send(user, &packet, sizeof(packet));
			}
		}
	}
}

/**
 * Send Chat Message to users in a specific game and group
 * @param game_name Game Name (Product Code)
 * @param group_name Group Name
 * @param message Chat Message
 */
void spread_group_message(const char * game_name, const char * group_name, const char * message)
{
	if(game_name == NULL || group_name == NULL || message == NULL) return;
	
	SceNetAdhocctlUserNode * user = _db_user;
	for(; user != NULL; user = user->next)
	{
		if(user->group != NULL && user->game != NULL)
		{
			// Match Game and Group
			if(strncmp((char *)user->game->game.data, game_name, PRODUCT_CODE_LENGTH) == 0 &&
			   strncmp((char *)user->group->group.data, group_name, 8) == 0)
			{
				SceNetAdhocctlChatPacketS2C packet;
				memset(&packet, 0, sizeof(packet));
				packet.base.base.opcode = OPCODE_CHAT;
				strcpy((char *)packet.name.data, "ADMIN");
				strcpy(packet.base.message, message);
				queue_send(user, &packet, sizeof(packet));
			}
		}
	}
}
