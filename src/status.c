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
#include <user.h>
#include <status.h>
#include <config.h>
#include <sqlite3.h>
#include <stdlib.h>
#include <http_server.h>

// Product ID Cache Structure
typedef struct ProductIDCache {
	char id[PRODUCT_CODE_LENGTH + 1];
	char name[128];
	struct ProductIDCache * next;
} ProductIDCache;

// Global Cache List
static ProductIDCache * _productid_cache = NULL;
static ProductIDCache * _crosslink_cache = NULL;

// Status Dirty Flag
static int _status_is_dirty = 0;

// Function Prototypes
const char * strcpyxml(char * out, const char * in, uint32_t size);
void clear_database_cache(void);
void load_database_cache(sqlite3 * db);

/**
 * Validate and initialize database tables
 */
void validate_database(void)
{
	sqlite3 * db = NULL;
	
	if(sqlite3_open(_server_database, &db) != SQLITE_OK)
	{
		fprintf(stderr, "Error: Failed to open database %s\n", _server_database);
		return;
	}
	
	// Check if productids table exists
	sqlite3_stmt * stmt = NULL;
	const char * check_productids = "SELECT name FROM sqlite_master WHERE type='table' AND name='productids'";
	int has_productids = 0;
	
	if(sqlite3_prepare_v2(db, check_productids, -1, &stmt, NULL) == SQLITE_OK)
	{
		if(sqlite3_step(stmt) == SQLITE_ROW)
		{
			has_productids = 1;
		}
		sqlite3_finalize(stmt);
	}
	
	if(!has_productids)
	{
		printf("Warning: productids table not found, creating...\n");
		char * errmsg = NULL;
		const char * create_productids = "CREATE TABLE IF NOT EXISTS productids (productid TEXT PRIMARY KEY, gamename TEXT)";
		
		if(sqlite3_exec(db, create_productids, NULL, NULL, &errmsg) != SQLITE_OK)
		{
			fprintf(stderr, "Error creating productids table: %s\n", errmsg);
			sqlite3_free(errmsg);
		}
		else
		{
			printf("Created productids table\n");
		}
	}
	
	// Check if crosslinks table exists (for future use)
	const char * check_crosslinks = "SELECT name FROM sqlite_master WHERE type='table' AND name='crosslinks'";
	int has_crosslinks = 0;
	
	if(sqlite3_prepare_v2(db, check_crosslinks, -1, &stmt, NULL) == SQLITE_OK)
	{
		if(sqlite3_step(stmt) == SQLITE_ROW)
		{
			has_crosslinks = 1;
		}
		sqlite3_finalize(stmt);
	}
	
	if(!has_crosslinks)
	{
		printf("Warning: crosslinks table not found, creating...\n");
		char * errmsg = NULL;
		const char * create_crosslinks = "CREATE TABLE IF NOT EXISTS crosslinks (id_from TEXT PRIMARY KEY, id_to TEXT)";
		
		if(sqlite3_exec(db, create_crosslinks, NULL, NULL, &errmsg) != SQLITE_OK)
		{
			fprintf(stderr, "Error creating crosslinks table: %s\n", errmsg);
			sqlite3_free(errmsg);
		}
		else
		{
			printf("Created crosslinks table\n");
		}
	}
	
	// Load Database Cache into RAM
	load_database_cache(db);
	
	sqlite3_close(db);
	printf("Database validation complete\n");
}

/**
 * Update Status Cache
 */
void update_status(void)
{
	// Define max buffer for XML output
	#define XML_BUFFER_SIZE (1024 * 512)
	
	char * xml_buf = (char *)malloc(XML_BUFFER_SIZE);
	if(xml_buf != NULL)
	{
		memset(xml_buf, 0, XML_BUFFER_SIZE);
		
		// Generate XML
		int xml_len = get_status_xml_string(xml_buf, XML_BUFFER_SIZE);
		
		// Push to HTTP thread cache
		update_http_status_cache(xml_buf, xml_len);
		
		free(xml_buf);
	}
	else
	{
		fprintf(stderr, "Error: Failed to allocate memory for status cache\n");
	}
	
	// Reset Dirty Flag
	_status_is_dirty = 0;
}

/**
 * Generate Status XML String
 * @param buffer Output buffer (must be pre-allocated)
 * @param max_size Maximum size of the buffer
 * @return Number of bytes written
 */
int get_status_xml_string(char * buffer, uint32_t max_size)
{
	if(buffer == NULL || max_size == 0) return 0;
	
	uint32_t written = 0;
	int len = 0;
	
	// Helper macro for snprintf
	#define APPEND_XML(...) \
		do { \
			len = snprintf(buffer + written, max_size - written, __VA_ARGS__); \
			if (len > 0) written += len; \
			if (written >= max_size) return written; \
		} while(0)
	
	// Write XML Header
	APPEND_XML("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
	APPEND_XML("<?xml-stylesheet type=\"text/xsl\" href=\"status.xsl\"?>\n");
	
	// Output Root Tag + User Count
	APPEND_XML("<prometheus usercount=\"%u\">\n", _db_user_count);
	
	// Iterate Games
	SceNetAdhocctlGameNode * game = _db_game; for(; game != NULL; game = game->next)
	{
		// Safe Product ID
		char productid[PRODUCT_CODE_LENGTH + 1];
		strncpy(productid, game->game.data, PRODUCT_CODE_LENGTH);
		productid[PRODUCT_CODE_LENGTH] = 0;
		
		// Display Name
		char displayname[128];
		memset(displayname, 0, sizeof(displayname));
		
		// Find Game Name in RAM Cache
		const char * gamename = find_cached_gamename(productid);
		
		if(gamename != NULL)
		{
			// Copy Game Name
			strcpyxml(displayname, gamename, sizeof(displayname));
		}
		else
		{
			// Use Product Code as Name
			strcpyxml(displayname, productid, sizeof(displayname));
		}
		
		// Output Game Tag + Game Name
		APPEND_XML("\t<game name=\"%s\" usercount=\"%u\">\n", displayname, game->playercount);
		
		// Activate User Count
		uint32_t activecount = 0;
		
		// Iterate Game Groups
		SceNetAdhocctlGroupNode * group = game->group; for(; group != NULL; group = group->next)
		{
			// Safe Group Name
			char groupname[ADHOCCTL_GROUPNAME_LEN + 1];
			strncpy(groupname, (const char *)group->group.data, ADHOCCTL_GROUPNAME_LEN);
			groupname[ADHOCCTL_GROUPNAME_LEN] = 0;
			
			// Output Group Tag + Group Name + User Count
			APPEND_XML("\t\t<group name=\"%s\" usercount=\"%u\">\n", strcpyxml(displayname, groupname, sizeof(displayname)), group->playercount);
			
			// Iterate Users
			SceNetAdhocctlUserNode * user = group->player; for(; user != NULL; user = user->group_next)
			{
				// Output User Tag + Username
				uint8_t * ip_ptr = (uint8_t *)&user->resolver.ip;
				APPEND_XML("\t\t\t<user mac=\"%02X:%02X:%02X:%02X:%02X:%02X\" ip=\"%u.%u.%u.%u\">%s</user>\n", 
					user->resolver.mac.data[0], user->resolver.mac.data[1], user->resolver.mac.data[2],
					user->resolver.mac.data[3], user->resolver.mac.data[4], user->resolver.mac.data[5],
					ip_ptr[0], ip_ptr[1], ip_ptr[2], ip_ptr[3],
					strcpyxml(displayname, (const char *)user->resolver.name.data, sizeof(displayname)));
			}
			
			// Output Closing Group Tag
			APPEND_XML("\t\t</group>\n");
			
			// Increase Active Game User Count
			activecount += group->playercount;
		}
		
		// Output Idle Game Group
		if(game->playercount > activecount)
		{
			// Output Group Tag + Group Name + Idle User Count
			APPEND_XML("\t\t<group name=\"Groupless\" usercount=\"%u\" />\n", game->playercount - activecount);
		}
		
		// Output Closing Game Tag
		APPEND_XML("\t</game>\n");
	}
	
	// Output Closing Root Tag
	APPEND_XML("</prometheus>");
	
	return written;
}

/**
 * Mark Status as Dirty (for throttled update)
 */
void update_status_dirty(void)
{
	_status_is_dirty = 1;
}

/**
 * Check if status needs updating
 */
int is_status_dirty(void)
{
	return _status_is_dirty;
}

/**
 * Load Database Cache from SQLite
 */
void load_database_cache(sqlite3 * db)
{
	// Clear existing cache
	clear_database_cache();
	
	sqlite3_stmt * stmt = NULL;
	uint32_t count = 0;
	
	// Load Product IDs
	const char * sql_p = "SELECT id, name FROM productids";
	if(sqlite3_prepare_v2(db, sql_p, -1, &stmt, NULL) == SQLITE_OK)
	{
		while(sqlite3_step(stmt) == SQLITE_ROW)
		{
			ProductIDCache * entry = (ProductIDCache *)malloc(sizeof(ProductIDCache));
			if(entry != NULL)
			{
				const char * id = (const char *)sqlite3_column_text(stmt, 0);
				const char * name = (const char *)sqlite3_column_text(stmt, 1);
				
				if(id) strncpy(entry->id, id, PRODUCT_CODE_LENGTH);
				entry->id[PRODUCT_CODE_LENGTH] = 0;
				
				if(name) strncpy(entry->name, name, sizeof(entry->name) - 1);
				entry->name[sizeof(entry->name) - 1] = 0;
				
				entry->next = _productid_cache;
				_productid_cache = entry;
				count++;
			}
		}
		sqlite3_finalize(stmt);
	}
	printf("Loaded %u game names into RAM cache\n", count);
	
	// Load Crosslinks
	count = 0;
	const char * sql_c = "SELECT id_from, id_to FROM crosslinks";
	if(sqlite3_prepare_v2(db, sql_c, -1, &stmt, NULL) == SQLITE_OK)
	{
		while(sqlite3_step(stmt) == SQLITE_ROW)
		{
			ProductIDCache * entry = (ProductIDCache *)malloc(sizeof(ProductIDCache));
			if(entry != NULL)
			{
				const char * id_from = (const char *)sqlite3_column_text(stmt, 0);
				const char * id_to = (const char *)sqlite3_column_text(stmt, 1);
				
				if(id_from) strncpy(entry->id, id_from, PRODUCT_CODE_LENGTH);
				entry->id[PRODUCT_CODE_LENGTH] = 0;
				
				if(id_to) strncpy(entry->name, id_to, sizeof(entry->name) - 1);
				entry->name[sizeof(entry->name) - 1] = 0;
				
				entry->next = _crosslink_cache;
				_crosslink_cache = entry;
				count++;
			}
		}
		sqlite3_finalize(stmt);
	}
	printf("Loaded %u crosslinks into RAM cache\n", count);
}

/**
 * Clear Database Cache
 */
void clear_database_cache(void)
{
	ProductIDCache * curr = _productid_cache;
	while(curr != NULL)
	{
		ProductIDCache * next = curr->next;
		free(curr);
		curr = next;
	}
	_productid_cache = NULL;
	
	curr = _crosslink_cache;
	while(curr != NULL)
	{
		ProductIDCache * next = curr->next;
		free(curr);
		curr = next;
	}
	_crosslink_cache = NULL;
}

/**
 * Find Game Name in RAM Cache
 */
const char * find_cached_gamename(const char * productid)
{
	ProductIDCache * curr = _productid_cache;
	while(curr != NULL)
	{
		if(strcmp(curr->id, productid) == 0) return curr->name;
		curr = curr->next;
	}
	return NULL;
}

/**
 * Find Crosslink in RAM Cache
 */
const char * find_cached_crosslink(const char * productid)
{
	ProductIDCache * curr = _crosslink_cache;
	while(curr != NULL)
	{
		if(strcmp(curr->id, productid) == 0) return curr->name;
		curr = curr->next;
	}
	return NULL;
}

/**
 * Check if Product ID exists in RAM Cache
 */
int is_productid_cached(const char * productid)
{
	ProductIDCache * curr = _productid_cache;
	while(curr != NULL)
	{
		if(strcmp(curr->id, productid) == 0) return 1;
		curr = curr->next;
	}
	return 0;
}

/**
 * Add Product ID to RAM Cache (for auto-added games)
 */
void add_to_productid_cache(const char * id, const char * name)
{
	if(is_productid_cached(id)) return;
	
	ProductIDCache * entry = (ProductIDCache *)malloc(sizeof(ProductIDCache));
	if(entry != NULL)
	{
		strncpy(entry->id, id, PRODUCT_CODE_LENGTH);
		entry->id[PRODUCT_CODE_LENGTH] = 0;
		
		strncpy(entry->name, name, sizeof(entry->name) - 1);
		entry->name[sizeof(entry->name) - 1] = 0;
		
		entry->next = _productid_cache;
		_productid_cache = entry;
	}
}

/**
 * Escape XML Sequences to avoid malformed XML files.
 * @param out Out Buffer
 * @param in In Buffer
 * @param size Size of Out Buffer
 * @return Reference to Out Buffer
 */
const char * strcpyxml(char * out, const char * in, uint32_t size)
{
	// Valid Arguments
	if(out != NULL && in != NULL && size > 0)
	{
		// Clear Memory
		memset(out, 0, size);
		
		// Written Size Pointer
		uint32_t written = 0;
		
		// Iterate In-Buffer Symbols
		uint32_t i = 0; for(; i < strlen(in); i++)
		{
			// " Symbol
			if(in[i] == '"')
			{
				// Enough Space in Out-Buffer (6B for &quot;)
				if((size - written) > 6)
				{
					// Write Escaped Sequence
					strcpy(out + written, "&quot;");
					
					// Move Pointer
					written += 6;
				}
				
				// Truncate required
				else break;
			}
			
			// < Symbol
			else if(in[i] == '<')
			{
				// Enough Space in Out-Buffer (4B for &lt;)
				if((size - written) > 4)
				{
					// Write Escaped Sequence
					strcpy(out + written, "&lt;");
					
					// Move Pointer
					written += 4;
				}
				
				// Truncate required
				else break;
			}
			
			// > Symbol
			else if(in[i] == '>')
			{
				// Enough Space in Out-Buffer (4B for &gt;)
				if((size - written) > 4)
				{
					// Write Escaped Sequence
					strcpy(out + written, "&gt;");
					
					// Move Pointer
					written += 4;
				}
				
				// Truncate required
				else break;
			}
			
			// & Symbol
			else if(in[i] == '&')
			{
				// Enough Space in Out-Buffer (5B for &amp;)
				if((size - written) > 5)
				{
					// Write Escaped Sequence
					strcpy(out + written, "&amp;");
					
					// Move Pointer
					written += 5;
				}
				
				// Truncate required
				else break;
			}
			
			// Normal Character
			else
			{
				// Enough Space in Out-Buffer (1B)
				if((size - written) > 1)
				{
					// Write Character
					out[written++] = in[i];
				}
			}
		}
		
		// Return Reference
		return out;
	}
	
	// Invalid Arguments
	return NULL;
}

