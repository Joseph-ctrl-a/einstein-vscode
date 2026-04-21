import * as vscode from 'vscode';

const SECRET_USERNAME = 'einstein.username';
const SECRET_PASSWORD = 'einstein.password';

export class CredentialManager {
    constructor(private readonly context: vscode.ExtensionContext) {}

    async get(): Promise<{ username: string; password: string } | undefined> {
        const username = await this.context.secrets.get(SECRET_USERNAME);
        const password = await this.context.secrets.get(SECRET_PASSWORD);
        if (username && password) {
            return { username, password };
        }
        return undefined;
    }

    async promptAndStore(): Promise<{ username: string; password: string } | undefined> {
        const existing = await this.get();

        const username = await vscode.window.showInputBox({
            title: 'Einstein — DCU Username',
            prompt: 'Enter your DCU username (without @dcu.ie)',
            value: existing?.username ?? '',
            ignoreFocusOut: true,
            validateInput: v => v.trim() ? undefined : 'Username cannot be empty'
        });
        if (!username) { return undefined; }

        const password = await vscode.window.showInputBox({
            title: 'Einstein — DCU Password',
            prompt: 'Enter your DCU password',
            password: true,
            ignoreFocusOut: true,
            validateInput: v => v.trim() ? undefined : 'Password cannot be empty'
        });
        if (!password) { return undefined; }

        await this.context.secrets.store(SECRET_USERNAME, username.trim());
        await this.context.secrets.store(SECRET_PASSWORD, password);

        return { username: username.trim(), password };
    }

    async clear(): Promise<void> {
        await this.context.secrets.delete(SECRET_USERNAME);
        await this.context.secrets.delete(SECRET_PASSWORD);
    }
}
