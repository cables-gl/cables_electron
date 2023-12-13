import moment from "moment";
import Util from "./util.js";

class HelperUtil extends Util
{
    constructor()
    {
        super();
        this.MAX_NAME_LENGTH = 128;
        this.DATE_FORMAT_LOG = "YYYY-MM-DD HH:mm";
        this.DATE_FORMAT_DISPLAY = "MMM D, YYYY [at] HH:mm";
        this.DATE_MOMENT_CUTOFF_DAYS = 7;
    }

    endl(str)
    {
        return str + "\n";
    }

    capitalizeFirstLetter(string)
    {
        return string.charAt(0).toUpperCase() + string.slice(1);
    }

    formatDate(date, format = null)
    {
        if (format === "log")
        {
            if (this.isNumeric(date) && String(date).length < 11) date *= 1000;
            return moment(date).format(this.DATE_FORMAT_LOG);
        }
        else if (format === "relative")
        {
            if (this.isNumeric(date) && String(date).length < 11) date *= 1000;
            const m = moment(date);
            if (m.isBefore(moment().subtract(this.DATE_MOMENT_CUTOFF_DAYS, "days"))) return moment(date).format(this.DATE_FORMAT_DISPLAY);
            return m.fromNow();
        }
        else if (format === "display")
        {
            if (this.isNumeric(date) && String(date).length < 11) date *= 1000;
            return moment(date).format(this.DATE_FORMAT_DISPLAY);
        }
        else
        {
            const monthNames = [
                "January", "February", "March",
                "April", "May", "June", "July",
                "August", "September", "October",
                "November", "December"
            ];

            const day = date.getDate();
            const monthIndex = date.getMonth();
            const year = date.getFullYear();

            return day + " " + monthNames[monthIndex] + " " + year;
        }
    }

    removeTrailingSpaces(input)
    {
        if (!input) return "";
        return input.split("\n").map(function (x)
        {
            return x.trimRight();
        }).join("\n");
    }

    isNumeric(n)
    {
        return !isNaN(parseFloat(n)) && isFinite(n);
    }

    uniqueArray(arr)
    {
        const u = {}, a = [];
        for (let i = 0, l = arr.length; i < l; ++i)
        {
            if (!u.hasOwnProperty(arr[i]))
            {
                a.push(arr[i]);
                u[arr[i]] = 1;
            }
        }
        return a;
    }

    validateEmail(email)
    {
    // var re = /^([\w-]+(?:\.[\w-]+)*)@((?:[\w-]+\.)*\w[\w-]{0,66})\.([a-z]{2,6}(?:\.[a-z]{2})?)$/i;
        const re = /^([^\x00-\x20\x22\x28\x29\x2c\x2e\x3a-\x3c\x3e\x40\x5b-\x5d\x7f-\xff]+|\x22([^\x0d\x22\x5c\x80-\xff]|\x5c[\x00-\x7f])*\x22)(\x2e([^\x00-\x20\x22\x28\x29\x2c\x2e\x3a-\x3c\x3e\x40\x5b-\x5d\x7f-\xff]+|\x22([^\x0d\x22\x5c\x80-\xff]|\x5c[\x00-\x7f])*\x22))*\x40([^\x00-\x20\x22\x28\x29\x2c\x2e\x3a-\x3c\x3e\x40\x5b-\x5d\x7f-\xff]+|\x5b([^\x0d\x5b-\x5d\x80-\xff]|\x5c[\x00-\x7f])*\x5d)(\x2e([^\x00-\x20\x22\x28\x29\x2c\x2e\x3a-\x3c\x3e\x40\x5b-\x5d\x7f-\xff]+|\x5b([^\x0d\x5b-\x5d\x80-\xff]|\x5c[\x00-\x7f])*\x5d))*$/;

        return re.test(email);
    }

    sanitizeUsername(name)
    {
        name = name || "";
        name = name.toLowerCase();
        name = name.split(" ").join("_");
        name = name.replace(/\./g, "_");
        if (name.match(/^\d/))name = "u_" + name;
        return name;
    }

    sanitizeForUrlKey(name)
    {
        name = name || "";
        name = name.toLowerCase();
        name = name.split(" ").join("_");
        name = name.replace(/\./g, "_");
        return name;
    }

    /**
     * Shuffles an array, returns the same array with shuffles elements
     * @param {Array} array
     */
    shuffle(array)
    {
        let counter = array.length;
        // While there are elements in the array
        while (counter > 0)
        {
        // Pick a random index
            const index = Math.floor(Math.random() * counter);
            // Decrease counter by 1
            counter--;
            // And swap the last element with it
            const temp = array[counter];
            array[counter] = array[index];
            array[index] = temp;
        }
        return array;
    }

    getPaginationInfo(items = [], limit = 0, offset = 0, fullCount = null)
    {
        let count = items.length;
        if (fullCount !== null) count = fullCount;
        let theLimit = Number(limit);
        let theOffset = Number(offset);

        if (!theLimit) theLimit = 0;
        if (!theOffset) theOffset = 0;

        let pages = 1;
        let currentPage = 1;
        let itemsOnPage = theLimit;

        if (theLimit > 0)
        {
            pages = Math.ceil(count / theLimit);

            if (offset > 0)
            {
                currentPage = (theOffset / theLimit) + 1;
            }

            if ((theOffset + theLimit) > count)
            {
                itemsOnPage = (count - theOffset);
            }
        }
        else
        {
            itemsOnPage = (count - theOffset);
            theLimit = 0;
        }

        itemsOnPage = Math.max(itemsOnPage, 0);

        return {
            "count": count,
            "offset": theOffset,
            "limit": theLimit,
            "pages": pages,
            "currentPage": currentPage,
            "itemsOnPage": itemsOnPage,
            "nextPage": Math.min(pages, currentPage + 1),
            "prevPage": Math.max(1, currentPage - 1)
        };
    }

    fisherYatesShuffle(array)
    {
        let i = 0;
        let j = 0;
        let temp = null;
        for (i = array.length - 1; i > 0; i -= 1)
        {
            j = Math.floor(Math.random() * (i + 1));
            temp = array[i];
            array[i] = array[j];
            array[j] = temp;
        }
    }

    leven(first, second)
    {
        if (first === second)
        {
            return 0;
        }

        const swap = first;

        // Swapping the strings if `a` is longer than `b` so we know which one is the
        // shortest & which one is the longest
        if (first.length > second.length)
        {
            first = second;
            second = swap;
        }

        let firstLength = first.length;
        let secondLength = second.length;

        // Performing suffix trimming:
        // We can linearly drop suffix common to both strings since they
        // don't increase distance at all
        // Note: `~-` is the bitwise way to perform a `- 1` operation
        while (firstLength > 0 && (first.charCodeAt(~-firstLength) === second.charCodeAt(~-secondLength)))
        {
            firstLength--;
            secondLength--;
        }

        // Performing prefix trimming
        // We can linearly drop prefix common to both strings since they
        // don't increase distance at all
        let start = 0;

        while (start < firstLength && (first.charCodeAt(start) === second.charCodeAt(start)))
        {
            start++;
        }

        firstLength -= start;
        secondLength -= start;

        if (firstLength === 0)
        {
            return secondLength;
        }

        let bCharacterCode;
        let result;
        let temporary;
        let temporary2;
        let index = 0;
        let index2 = 0;

        const array = [];
        const characterCodeCache = [];

        while (index < firstLength)
        {
            characterCodeCache[index] = first.charCodeAt(start + index);
            array[index] = ++index;
        }

        while (index2 < secondLength)
        {
            bCharacterCode = second.charCodeAt(start + index2);
            temporary = index2++;
            result = index2;

            for (index = 0; index < firstLength; index++)
            {
                temporary2 = bCharacterCode === characterCodeCache[index] ? temporary : temporary + 1;
                temporary = array[index];
                // eslint-disable-next-line no-multi-assign,no-nested-ternary
                result = array[index] = temporary > result ? (temporary2 > result ? result + 1 : temporary2) : (temporary2 > temporary ? temporary + 1 : temporary2);
            }
        }

        return result;
    }

    copy(aObject)
    {
        // Prevent undefined objects
        // if (!aObject) return aObject;

        let bObject = Array.isArray(aObject) ? [] : {};

        let value;
        for (const key in aObject)
        {
            // Prevent self-references to parent object
            // if (Object.is(aObject[key], aObject)) continue;

            value = aObject[key];

            bObject[key] = (typeof value === "object") ? this.copy(value) : value;
        }

        return bObject;
    }

    getLogEntry(key, text, date = null)
    {
        if (!date) date = Date.now();
        return { "created": date, "key": key, "text": text };
    }
}

export default new HelperUtil();
