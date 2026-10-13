import { SharedLogger, utilProvider } from "cables-shared-api";

// this class exists to not have electron dependencies during gulp tasks
class BuildLogger extends SharedLogger
{
    _logConsole(initiator, level, context, args)
    {
        // time only and no initiator, same as the gulp output
        const time = "[" + new Date().toTimeString().substring(0, 8) + "]";
        switch (level)
        {
        case "uncaught":
        case "error":
            console.error(time, ...args);
            break;
        case "warn":
            console.warn(time, ...args);
            break;
        case "verbose":
        case "debug":
            console.debug(time, ...args);
            break;
        case "startTime":
            console.time(...args);
            break;
        case "endTime":
            console.timeEnd(...args);
            break;
        default:
            console.info(time, ...args);
            break;
        }
    }
}

export default new BuildLogger(utilProvider);
