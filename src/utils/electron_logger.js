import { BaseLogger } from "cables-shared";
import electronUtilProvider from "./electron_util_provider.js";

class ElectronLogger extends BaseLogger
{
    get utilName()
    {
        return electronUtilProvider.LOGGER_NAME;
    }

    debug(...args)
    {
        this._logConsole("standalone - " + this._initiator, "debug", this._getContext(), args);
    }

    endTime(...args)
    {
        this._logConsole("standalone - " + this._initiator, "endTime", this._getContext(), args);
    }

    error(...args)
    {
        this._logConsole("standalone - " + this._initiator, "error", this._getContext(), args);
    }

    info(...args)
    {
        this._logConsole("standalone - " + this._initiator, "info", this._getContext(), args);
    }

    startTime(...args)
    {
        this._logConsole("standalone - " + this._initiator, "startTime", this._getContext(), args);
    }

    uncaught(...args)
    {
        this._logConsole("standalone - " + this._initiator, "uncaught", this._getContext(), args);
    }

    verbose(...args)
    {
        this._logConsole("standalone - " + this._initiator, "verbose", this._getContext(), args);
    }

    warn(...args)
    {
        this._logConsole("standalone - " + this._initiator, "warn", this._getContext(), args);
    }
}

export default new ElectronLogger(electronUtilProvider);
