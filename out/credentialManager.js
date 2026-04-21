"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.CredentialManager = void 0;
const vscode = __importStar(require("vscode"));
const SECRET_USERNAME = 'einstein.username';
const SECRET_PASSWORD = 'einstein.password';
class CredentialManager {
    constructor(context) {
        this.context = context;
    }
    async get() {
        const username = await this.context.secrets.get(SECRET_USERNAME);
        const password = await this.context.secrets.get(SECRET_PASSWORD);
        if (username && password) {
            return { username, password };
        }
        return undefined;
    }
    async promptAndStore() {
        const existing = await this.get();
        const username = await vscode.window.showInputBox({
            title: 'Einstein — DCU Username',
            prompt: 'Enter your DCU username (without @dcu.ie)',
            value: existing?.username ?? '',
            ignoreFocusOut: true,
            validateInput: v => v.trim() ? undefined : 'Username cannot be empty'
        });
        if (!username) {
            return undefined;
        }
        const password = await vscode.window.showInputBox({
            title: 'Einstein — DCU Password',
            prompt: 'Enter your DCU password',
            password: true,
            ignoreFocusOut: true,
            validateInput: v => v.trim() ? undefined : 'Password cannot be empty'
        });
        if (!password) {
            return undefined;
        }
        await this.context.secrets.store(SECRET_USERNAME, username.trim());
        await this.context.secrets.store(SECRET_PASSWORD, password);
        return { username: username.trim(), password };
    }
    async clear() {
        await this.context.secrets.delete(SECRET_USERNAME);
        await this.context.secrets.delete(SECRET_PASSWORD);
    }
}
exports.CredentialManager = CredentialManager;
