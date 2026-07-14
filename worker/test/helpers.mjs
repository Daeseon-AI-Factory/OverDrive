export class MemoryD1 {
  constructor() {
    this.principals = new Map();
    this.periods = new Map();
    this.sandboxDaily = new Map();
    this.requests = new Map();
    this.tombstones = new Map();
    this.rankDeletes = [];
  }

  prepare(sql) {
    return new MemoryStatement(this, sql);
  }

  async batch(statements) {
    const snapshot = {
      principals: new Map(this.principals),
      periods: new Map([...this.periods].map(([key, value]) => [key, { ...value }])),
      sandboxDaily: new Map([...this.sandboxDaily].map(([key, value]) => [key, { ...value }])),
      requests: new Map([...this.requests].map(([key, value]) => [key, { ...value }])),
      tombstones: new Map([...this.tombstones].map(([key, value]) => [key, { ...value }])),
    };
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      return results;
    } catch (error) {
      this.principals = snapshot.principals;
      this.periods = snapshot.periods;
      this.sandboxDaily = snapshot.sandboxDaily;
      this.requests = snapshot.requests;
      this.tombstones = snapshot.tombstones;
      throw error;
    }
  }
}

class MemoryStatement {
  constructor(database, sql, values = []) {
    this.database = database;
    this.sql = sql.replace(/\s+/gu, ' ').trim();
    this.values = values;
  }

  bind(...values) {
    return new MemoryStatement(this.database, this.sql, values);
  }

  async first() {
    const [first, second] = this.values;
    if (this.sql.startsWith('SELECT blocked_until_ms FROM ai_entitlement_tombstone')) {
      return this.database.tombstones.get(first) || null;
    }
    if (this.sql.startsWith('SELECT session_epoch FROM ai_entitlement_principal')) {
      const epoch = this.database.principals.get(first);
      return epoch ? { session_epoch: epoch } : null;
    }
    if (this.sql.startsWith('SELECT p.session_epoch FROM ai_entitlement_principal p')) {
      const epoch = this.database.principals.get(first);
      const tombstone = this.database.tombstones.get(first);
      return epoch && Number(tombstone?.blocked_until_ms) <= Number(second)
        ? { session_epoch: epoch }
        : epoch && !tombstone
          ? { session_epoch: epoch }
          : null;
    }
    if (this.sql.startsWith('SELECT credits_used, photos_used FROM ai_quota_period')) {
      const row = this.database.periods.get(`${first}|${second}`);
      return row ? { credits_used: row.credits_used, photos_used: row.photos_used } : null;
    }
    if (this.sql.startsWith('SELECT state FROM ai_quota_request')) {
      const row = this.database.requests.get(`${first}|${second}`);
      return row ? { state: row.state } : null;
    }
    throw new Error(`Unhandled D1 first: ${this.sql}`);
  }

  async run() {
    const db = this.database;
    if (this.sql.startsWith('DELETE FROM ai_quota_request WHERE EXISTS')) {
      const [now] = this.values;
      let changes = 0;
      for (const [key, row] of db.requests) {
        const period = db.periods.get(`${row.actor}|${row.period}`);
        if (period && period.period_end_ms <= now) {
          db.requests.delete(key);
          changes += 1;
        }
      }
      return result(changes);
    }
    if (this.sql.startsWith('DELETE FROM ai_quota_period WHERE period_end_ms <= ?')) {
      const [now] = this.values;
      let changes = 0;
      for (const [key, period] of db.periods) {
        if (period.period_end_ms <= now) {
          db.periods.delete(key);
          changes += 1;
        }
      }
      return result(changes);
    }
    if (this.sql.startsWith('DELETE FROM ai_sandbox_daily_attempt WHERE day_end_ms <= ?')) {
      const [now] = this.values;
      let changes = 0;
      for (const [key, daily] of db.sandboxDaily) {
        if (daily.day_end_ms > now) continue;
        db.sandboxDaily.delete(key);
        for (const [requestKey, request] of db.requests) {
          if (request.actor === daily.actor && request.sandbox_day_key === daily.dayKey) {
            db.requests.delete(requestKey);
          }
        }
        changes += 1;
      }
      return result(changes);
    }
    if (this.sql.startsWith('DELETE FROM ai_entitlement_principal WHERE NOT EXISTS')) {
      let changes = 0;
      for (const actor of db.principals.keys()) {
        const hasPeriod = [...db.periods.values()].some((period) => period.actor === actor);
        if (!hasPeriod) {
          db.principals.delete(actor);
          changes += 1;
        }
      }
      return result(changes);
    }
    if (this.sql.startsWith('DELETE FROM ai_entitlement_tombstone WHERE actor_key = ? AND blocked_until_ms <= ?')) {
      const [actor, now] = this.values;
      const tombstone = db.tombstones.get(actor);
      const changes = tombstone && tombstone.blocked_until_ms <= now && db.tombstones.delete(actor) ? 1 : 0;
      return result(changes);
    }
    if (this.sql.startsWith('DELETE FROM ai_entitlement_tombstone WHERE blocked_until_ms <= ?')) {
      const [now] = this.values;
      let changes = 0;
      for (const [actor, tombstone] of db.tombstones) {
        if (tombstone.blocked_until_ms <= now) {
          db.tombstones.delete(actor);
          changes += 1;
        }
      }
      return result(changes);
    }
    if (this.sql.startsWith('INSERT OR IGNORE INTO ai_entitlement_principal')) {
      const [actor, epoch, , , tombstoneActor, now] = this.values;
      const tombstone = db.tombstones.get(tombstoneActor);
      if (this.sql.includes('WHERE NOT EXISTS') && Number(tombstone?.blocked_until_ms) > Number(now)) {
        return result(0);
      }
      if (db.principals.has(actor)) return result(0);
      db.principals.set(actor, epoch);
      return result(1);
    }
    if (this.sql.startsWith('INSERT OR IGNORE INTO ai_quota_period')) {
      const [actor, period, periodStart, periodEnd, , tombstoneActor, now] = this.values;
      const tombstone = db.tombstones.get(tombstoneActor);
      if (this.sql.includes('WHERE NOT EXISTS') && Number(tombstone?.blocked_until_ms) > Number(now)) {
        return result(0);
      }
      const key = `${actor}|${period}`;
      if (db.periods.has(key)) return result(0);
      if (!db.principals.has(actor)) throw new Error('foreign key constraint failed');
      db.periods.set(key, {
        actor,
        period,
        period_start_ms: periodStart,
        period_end_ms: periodEnd,
        credits_used: 0,
        photos_used: 0,
        attempt_credits: 0,
        photo_attempts: 0,
      });
      return result(1);
    }
    if (this.sql.startsWith('INSERT OR IGNORE INTO ai_sandbox_daily_attempt')) {
      const [actor, dayKey, dayStartMs, dayEndMs, updatedAtMs] = this.values;
      const key = `${actor}|${dayKey}`;
      if (db.sandboxDaily.has(key)) return result(0);
      db.sandboxDaily.set(key, {
        actor,
        dayKey,
        day_start_ms: dayStartMs,
        day_end_ms: dayEndMs,
        attempt_credits: 0,
        photo_attempts: 0,
        updated_at_ms: updatedAtMs,
      });
      return result(1);
    }
    if (this.sql.startsWith('INSERT OR IGNORE INTO ai_quota_request')) {
      const [
        actor,
        requestKey,
        period,
        sandboxDayKey,
        route,
        creditCost,
        photoCost,
        createdAt,
        updatedAt,
      ] = this.values;
      const requestMapKey = `${actor}|${requestKey}`;
      if (db.requests.has(requestMapKey)) return result(0);
      const quota = db.periods.get(`${actor}|${period}`);
      if (!quota) throw new Error('quota_period_missing');
      if (quota.credits_used + creditCost > 1_000) throw new Error('monthly_credit_limit_reached');
      if (quota.photos_used + photoCost > 60) throw new Error('monthly_photo_limit_reached');
      if (quota.attempt_credits + creditCost > 1_250) {
        throw new Error('monthly_provider_attempt_limit_reached');
      }
      if (quota.photo_attempts + photoCost > 75) {
        throw new Error('monthly_photo_attempt_limit_reached');
      }
      const sandboxDaily = sandboxDayKey
        ? db.sandboxDaily.get(`${actor}|${sandboxDayKey}`)
        : null;
      if (sandboxDayKey && !sandboxDaily) throw new Error('sandbox_daily_attempt_missing');
      if (sandboxDaily?.attempt_credits + creditCost > 200) {
        throw new Error('sandbox_daily_provider_attempt_limit_reached');
      }
      if (sandboxDaily?.photo_attempts + photoCost > 12) {
        throw new Error('sandbox_daily_photo_attempt_limit_reached');
      }
      quota.credits_used += creditCost;
      quota.photos_used += photoCost;
      quota.attempt_credits += creditCost;
      quota.photo_attempts += photoCost;
      if (sandboxDaily) {
        sandboxDaily.attempt_credits += creditCost;
        sandboxDaily.photo_attempts += photoCost;
        sandboxDaily.updated_at_ms = updatedAt;
      }
      db.requests.set(requestMapKey, {
        actor,
        requestKey,
        period,
        sandbox_day_key: sandboxDayKey,
        route,
        credit_cost: creditCost,
        photo_cost: photoCost,
        state: 'reserved',
        created_at_ms: createdAt,
        updated_at_ms: updatedAt,
      });
      return result(1);
    }
    if (this.sql.startsWith("UPDATE ai_quota_request SET state = 'refunded'")) {
      const scoped = this.sql.includes('WHERE actor_key = ? AND period_key = ?');
      const [updatedAt, actor, period, scopedStaleBefore] = this.values;
      const staleBefore = scoped ? scopedStaleBefore : this.values[1];
      let changes = 0;
      for (const row of db.requests.values()) {
        if (scoped && (row.actor !== actor || row.period !== period)) continue;
        if (row.state !== 'reserved' || row.updated_at_ms > staleBefore) continue;
        row.state = 'refunded';
        row.updated_at_ms = updatedAt;
        const quota = db.periods.get(`${row.actor}|${row.period}`);
        if (quota) {
          quota.credits_used = Math.max(0, quota.credits_used - row.credit_cost);
          quota.photos_used = Math.max(0, quota.photos_used - row.photo_cost);
          quota.updated_at_ms = updatedAt;
        }
        changes += 1;
      }
      return result(changes);
    }
    if (this.sql.startsWith('UPDATE ai_quota_request SET state = ?')) {
      const [state, updatedAt, actor, requestKey] = this.values;
      const row = db.requests.get(`${actor}|${requestKey}`);
      if (!row || row.state !== 'reserved') return result(0);
      row.state = state;
      row.updated_at_ms = updatedAt;
      if (state === 'refunded') {
        const quota = db.periods.get(`${actor}|${row.period}`);
        if (quota) {
          quota.credits_used = Math.max(0, quota.credits_used - row.credit_cost);
          quota.photos_used = Math.max(0, quota.photos_used - row.photo_cost);
          quota.updated_at_ms = updatedAt;
        }
      }
      return result(1);
    }
    if (this.sql.startsWith('DELETE FROM ai_quota_request WHERE actor_key = ?')) {
      const [actor] = this.values;
      let changes = 0;
      for (const [key, row] of db.requests) {
        if (row.actor === actor) {
          db.requests.delete(key);
          changes += 1;
        }
      }
      return result(changes);
    }
    if (this.sql.startsWith('DELETE FROM ai_quota_period WHERE actor_key = ?')) {
      const [actor] = this.values;
      let changes = 0;
      for (const [key, row] of db.periods) {
        if (row.actor === actor) {
          db.periods.delete(key);
          changes += 1;
        }
      }
      return result(changes);
    }
    if (this.sql.startsWith('DELETE FROM ai_entitlement_principal WHERE actor_key = ?')) {
      const [actor] = this.values;
      return result(db.principals.delete(actor) ? 1 : 0);
    }
    if (this.sql.startsWith('INSERT INTO ai_entitlement_tombstone')) {
      const [actor, blockedUntil, deletedAt] = this.values;
      const existing = db.tombstones.get(actor);
      db.tombstones.set(actor, {
        blocked_until_ms: Math.max(existing?.blocked_until_ms || 0, blockedUntil),
        deleted_at_ms: deletedAt,
      });
      return result(1);
    }
    if (this.sql.startsWith('DELETE FROM rank_entry WHERE device_id = ?')) {
      db.rankDeletes.push(this.values[0]);
      return result(1);
    }
    throw new Error(`Unhandled D1 run: ${this.sql}`);
  }
}

function result(changes) {
  return { success: true, meta: { changes } };
}

export function encodeJws(payload) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'ES256', kid: 'apple' })}.${encode(payload)}.signature`;
}

export async function createApplePrivateKeyPem() {
  const pair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  );
  const bytes = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
  const body = Buffer.from(bytes).toString('base64').match(/.{1,64}/gu).join('\n');
  return `-----BEGIN PRIVATE KEY-----\n${body}\n-----END PRIVATE KEY-----`;
}

export function seedRetentionFixture(database, now = Date.now()) {
  const ids = {
    expiredActor: 'a'.repeat(64),
    activeActor: 'b'.repeat(64),
    mixedActor: 'c'.repeat(64),
    orphanActor: 'd'.repeat(64),
    expiredPeriod: '1'.repeat(64),
    activePeriod: '2'.repeat(64),
    mixedExpiredPeriod: '3'.repeat(64),
    mixedActivePeriod: '4'.repeat(64),
    expiredRequest: '5'.repeat(64),
    activeRequest: '6'.repeat(64),
    mixedExpiredRequest: '7'.repeat(64),
    mixedActiveRequest: '8'.repeat(64),
    expiredTombstone: 'e'.repeat(64),
    activeTombstone: 'f'.repeat(64),
  };
  for (const actor of [ids.expiredActor, ids.activeActor, ids.mixedActor, ids.orphanActor]) {
    database.principals.set(actor, actor.slice(0, 32));
  }
  const periods = [
    [ids.expiredActor, ids.expiredPeriod, now - 1],
    [ids.activeActor, ids.activePeriod, now + 60_000],
    [ids.mixedActor, ids.mixedExpiredPeriod, now - 1],
    [ids.mixedActor, ids.mixedActivePeriod, now + 60_000],
  ];
  for (const [actor, period, periodEnd] of periods) {
    database.periods.set(`${actor}|${period}`, {
      actor,
      period,
      period_start_ms: now - 60_000,
      period_end_ms: periodEnd,
      credits_used: 1,
      photos_used: 0,
      attempt_credits: 1,
      photo_attempts: 0,
    });
  }
  const requests = [
    [ids.expiredActor, ids.expiredPeriod, ids.expiredRequest],
    [ids.activeActor, ids.activePeriod, ids.activeRequest],
    [ids.mixedActor, ids.mixedExpiredPeriod, ids.mixedExpiredRequest],
    [ids.mixedActor, ids.mixedActivePeriod, ids.mixedActiveRequest],
  ];
  for (const [actor, period, requestKey] of requests) {
    database.requests.set(`${actor}|${requestKey}`, {
      actor,
      period,
      requestKey,
      route: 'workout_parse',
      credit_cost: 1,
      photo_cost: 0,
      state: 'completed',
    });
  }
  database.tombstones.set(ids.expiredTombstone, {
    blocked_until_ms: now - 1,
    deleted_at_ms: now - 60_000,
  });
  database.tombstones.set(ids.activeTombstone, {
    blocked_until_ms: now + 60_000,
    deleted_at_ms: now,
  });
  return ids;
}

export function assertRetentionCleanup(assert, database, ids) {
  assert.equal(database.requests.has(`${ids.expiredActor}|${ids.expiredRequest}`), false);
  assert.equal(database.requests.has(`${ids.activeActor}|${ids.activeRequest}`), true);
  assert.equal(database.requests.has(`${ids.mixedActor}|${ids.mixedExpiredRequest}`), false);
  assert.equal(database.requests.has(`${ids.mixedActor}|${ids.mixedActiveRequest}`), true);

  assert.equal(database.periods.has(`${ids.expiredActor}|${ids.expiredPeriod}`), false);
  assert.equal(database.periods.has(`${ids.activeActor}|${ids.activePeriod}`), true);
  assert.equal(database.periods.has(`${ids.mixedActor}|${ids.mixedExpiredPeriod}`), false);
  assert.equal(database.periods.has(`${ids.mixedActor}|${ids.mixedActivePeriod}`), true);

  assert.equal(database.principals.has(ids.expiredActor), false);
  assert.equal(database.principals.has(ids.activeActor), true);
  assert.equal(database.principals.has(ids.mixedActor), true);
  assert.equal(database.principals.has(ids.orphanActor), false);
  assert.equal(database.tombstones.has(ids.expiredTombstone), false);
  assert.equal(database.tombstones.has(ids.activeTombstone), true);
}
