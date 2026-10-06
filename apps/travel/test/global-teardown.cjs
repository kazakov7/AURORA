module.exports = async () => {
	if (globalThis.__AURA_MONGO_REPLSET__) {
		await globalThis.__AURA_MONGO_REPLSET__.stop();
	}
};
