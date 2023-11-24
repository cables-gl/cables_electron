class HelperUtil
{
    isNumeric(n)
    {
        return !isNaN(parseFloat(n)) && isFinite(n);
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

    removeTrailingSpaces(input)
    {
        return input.split("\n")
            .map(function (x)
            {
                return x.trimRight();
            })
            .join("\n");
    }
}

export default new HelperUtil();
