import { utilProvider, SharedSubPatchOpUtil } from "cables-shared-api";

class SubPatchOpUtil extends SharedSubPatchOpUtil {}

export default new SubPatchOpUtil(utilProvider);
