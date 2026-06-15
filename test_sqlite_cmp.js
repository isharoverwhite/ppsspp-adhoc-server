const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database(':memory:');

db.serialize(() => {
    db.run("CREATE TABLE t (id INT, joinedAt TEXT)");
    db.run("INSERT INTO t VALUES (1, '2026-06-14 15:00:00')");
    
    // Compare with Prisma's ISO string
    db.get("SELECT * FROM t WHERE joinedAt >= '2026-06-01T00:00:00.000Z'", (err, row) => {
        console.log("Q1:", row);
    });

    db.get("SELECT * FROM t WHERE joinedAt >= '2026-06-14T00:00:00.000Z'", (err, row) => {
        console.log("Q2:", row); // I bet this returns undefined!
    });
});
