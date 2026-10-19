const session = require("express-session");

class SqliteSessionStore extends session.Store {
  constructor(db, defaultMaxAge) {
    super();
    this.getStatement = db.prepare("SELECT session_json, expires_at FROM sessions WHERE sid = ?");
    this.setStatement = db.prepare("INSERT OR REPLACE INTO sessions (sid, session_json, expires_at) VALUES (?, ?, ?)");
    this.deleteStatement = db.prepare("DELETE FROM sessions WHERE sid = ?");
    this.pruneStatement = db.prepare("DELETE FROM sessions WHERE expires_at <= ?");
    this.pruneExpired();
    this.pruneTimer = setInterval(() => this.pruneExpired(), 15 * 60 * 1000);
    this.pruneTimer.unref();
    this.defaultMaxAge = defaultMaxAge;
  }

  get(sid, callback) {
    try {
      const row = this.getStatement.get(sid);
      if (!row) return callback(null, null);
      if (row.expires_at <= Date.now()) {
        this.deleteStatement.run(sid);
        return callback(null, null);
      }
      callback(null, JSON.parse(row.session_json));
    } catch (error) {
      callback(error);
    }
  }

  set(sid, value, callback = () => {}) {
    try {
      const expiresAt = value.cookie?.expires
        ? new Date(value.cookie.expires).getTime()
        : Date.now() + this.defaultMaxAge;
      this.setStatement.run(sid, JSON.stringify(value), expiresAt);
      callback(null);
    } catch (error) {
      callback(error);
    }
  }

  destroy(sid, callback = () => {}) {
    try {
      this.deleteStatement.run(sid);
      callback(null);
    } catch (error) {
      callback(error);
    }
  }

  pruneExpired() {
    try {
      this.pruneStatement.run(Date.now());
    } catch (error) {
      console.error("Não foi possível limpar sessões expiradas:", error);
    }
  }
}

module.exports = SqliteSessionStore;
