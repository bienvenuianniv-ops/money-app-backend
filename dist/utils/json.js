"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.jsonStringifyBigInt = jsonStringifyBigInt;
function jsonStringifyBigInt(obj) {
    return JSON.stringify(obj, (_key, value) => {
        return typeof value === "bigint" ? value.toString() : value;
    });
}
//# sourceMappingURL=json.js.map