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
exports.detectModule = detectModule;
exports.resolveModule = resolveModule;
exports.detectTask = detectTask;
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
// Matches DCU module codes: 2-4 letters followed by 3-4 digits (e.g. CA116, EE312, CA271)
const MODULE_PATTERN = /^[a-zA-Z]{2,4}\d{3,4}$/;
function detectModule(filePath) {
    const parts = filePath.split(/[\\/]/);
    // Walk path segments in reverse to find the closest module directory
    for (let i = parts.length - 1; i >= 0; i--) {
        if (MODULE_PATTERN.test(parts[i])) {
            return parts[i].toLowerCase();
        }
    }
    return undefined;
}
async function resolveModule(filePath) {
    const detected = detectModule(filePath);
    if (detected) {
        return detected;
    }
    // Fall back to VS Code setting
    const config = vscode.workspace.getConfiguration('einstein');
    const defaultModule = config.get('defaultModule', '');
    if (defaultModule.trim()) {
        return defaultModule.trim().toLowerCase();
    }
    // Ask the user
    const input = await vscode.window.showInputBox({
        title: 'Einstein — Module Code',
        prompt: 'Could not detect module from file path. Enter the module code (e.g. ca116)',
        ignoreFocusOut: true,
        validateInput: v => MODULE_PATTERN.test(v.trim()) ? undefined : 'Enter a valid module code (e.g. ca116, ca271)'
    });
    if (!input) {
        return undefined;
    }
    const module = input.trim().toLowerCase();
    // Offer to save it
    const save = await vscode.window.showInformationMessage(`Save "${module}" as your default module?`, 'Yes', 'No');
    if (save === 'Yes') {
        await config.update('defaultModule', module, vscode.ConfigurationTarget.Workspace);
    }
    return module;
}
function detectTask(filePath, module) {
    const parts = filePath.split(/[\\/]/);
    const moduleIdx = parts.findIndex(p => p.toLowerCase() === module);
    if (moduleIdx !== -1 && moduleIdx < parts.length - 2) {
        // The directory right after the module directory is the task
        return parts[moduleIdx + 1];
    }
    // Fall back to filename without extension
    return path.basename(filePath, path.extname(filePath));
}
