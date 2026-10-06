const { MongoMemoryReplSet } = require('mongodb-memory-server');

module.exports = async () => {
	process.env.MONGOMS_DOWNLOAD_DIR = process.env.MONGOMS_DOWNLOAD_DIR || '/tmp/aura-mongodb-binaries';
	const replSet = await MongoMemoryReplSet.create({
		replSet: { count: 1, storageEngine: 'wiredTiger' },
	});
	globalThis.__AURA_MONGO_REPLSET__ = replSet;
	process.env.AURA_E2E_MONGO_URI = replSet.getUri('aura_e2e');
};
