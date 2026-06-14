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

#ifndef _STATUS_H_
#define _STATUS_H_

/**
 * Update Status Logfile
 */
void update_status(void);

/**
 * Mark Status as Dirty (for throttled update)
 */
void update_status_dirty(void);

/**
 * Check if status needs updating
 */
int is_status_dirty(void);

/**
 * Generate Status XML String
 * @param buffer Output buffer (must be pre-allocated)
 * @param max_size Maximum size of the buffer
 * @return Number of bytes written
 */
int get_status_xml_string(char * buffer, uint32_t max_size);

/**
 * Validate and initialize database tables
 */
void validate_database(void);

/**
 * Find Game Name in RAM Cache
 */
const char * find_cached_gamename(const char * productid);

/**
 * Find Crosslink in RAM Cache
 */
const char * find_cached_crosslink(const char * productid);

/**
 * Check if Product ID exists in RAM Cache
 */
int is_productid_cached(const char * productid);

/**
 * Add Product ID to RAM Cache (for auto-added games)
 */
void add_to_productid_cache(const char * id, const char * name);

#endif

