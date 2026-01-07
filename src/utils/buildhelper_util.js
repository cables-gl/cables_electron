import { SharedHelperUtil, utilProvider } from "cables-shared-api";

// this class exists to not have electron dependencies during gulp tasks
class BuildHelperUtil extends SharedHelperUtil {}

export default new BuildHelperUtil(utilProvider);
