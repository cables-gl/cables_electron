import { utilProvider, SharedStorageUtil } from "cables-shared-api";

class StorageUtil extends SharedStorageUtil {}

export default new StorageUtil(utilProvider);
