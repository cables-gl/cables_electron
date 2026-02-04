import { utilProvider, SharedLogger } from "cables-shared-api";
import log from "electron-log/main.js";

class Logger extends SharedLogger
{
    constructor(provider)
    {
        super(provider);
        const logFormat = "[electron-{processType}] {d}.{m}.{y} {h}:{i}:{s} {text}";
        log.transports.file.maxSize = 20 * 1024 * 1024;
        log.initialize();
        log.transports.console.format = logFormat;
        log.transports.file.format = logFormat;
        log.transports.ipc.level = "debug";

        this.loadStart = performance.now();
        this.startUpLog = [];
    }

    debug(...args)
    {
        const level = "debug";
        if (this._logLevelFiltered(level)) return;
        log.debug("[" + this._initiator + "]", "DEBUG", args.join(" "));
    }

    verbose(...args)
    {
        const level = "verbose";
        if (this._logLevelFiltered(level)) return;
        log.verbose("[" + this._initiator + "]", args.join(" "));
    }

    info(...args)
    {
        const level = "info";
        if (this._logLevelFiltered(level)) return;
        log.info("[" + this._initiator + "]", args.join(" "));
    }

    warn(...args)
    {
        const level = "warn";
        if (this._logLevelFiltered(level)) return;
        log.warn("[" + this._initiator + "]", "WARN", args.join(" "));
    }

    error(...args)
    {
        const level = "error";
        if (this._logLevelFiltered(level)) return;
        log.error("[" + this._initiator + "]", "ERROR", args.join(" "), this._getContext(args));
    }

    endTime(...args)
    {
        super.endTime(...args);
    }

    startTime(...args)
    {
        super.startTime(...args);
    }

    event(...args)
    {
        // ignore events in electron
    }

    logStartup(title)
    {
        const time = Math.round((performance.now() - this.loadStart) / 1000 * 100) / 100;
        this.startUpLog.push({
            "title": title,
            "time": time
        });
        this.debug(title + " (" + time + "s)");
    }
}

export default new Logger(utilProvider);
