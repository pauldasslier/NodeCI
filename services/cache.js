const mongoose = require('mongoose');
const redis = require('redis');
const util = require('util');
const keys = require('../config/keys');

const client = redis.createClient(keys.redisUrl);
client.hget = util.promisify(client.hget);

const exec = mongoose.Query.prototype.exec;

mongoose.Query.prototype.cache = function(options = {}) {
  this.useCache = true;
  this.hashKey = JSON.stringify(options.key || '');
  return this;
}

mongoose.Query.prototype.exec = async function(arguments) {
  if (!this.useCache) {
    return exec.apply(this, arguments);
  }

  const redisKey = JSON.stringify(Object.assign({}, this.getQuery(), {
    collection: this.mongooseCollection.name,
  }));

  const cachedValue = await client.hget(this.hashKey, redisKey);

  if (cachedValue) {
    const mongooseDoc = JSON.parse(cachedValue);
    return Array.isArray(mongooseDoc)
      ? mongooseDoc.map((doc) => new this.model(doc))
      : new this.model(mongooseDoc);
  }

  const result = await exec.apply(this, arguments);
  client.hset(this.hashKey, redisKey, JSON.stringify(result));
  return result;
}

module.exports = {
  clearHash(hashKey) {
    client.del(JSON.stringify(hashKey));
  },
};