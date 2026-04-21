import * as vscode from 'vscode';
import { CredentialManager } from './credentialManager';
import { EinsteinPty } from './einsteinTerminal';

export function activate(context: vscode.ExtensionContext): void {
    const credentials = new CredentialManager(context);

    // Register the Einstein terminal profile — shows up in the terminal dropdown
    context.subscriptions.push(
        vscode.window.registerTerminalProfileProvider('einstein.terminal', {
            provideTerminalProfile(): vscode.TerminalProfile {
                return new vscode.TerminalProfile({
                    name: 'Einstein',
                    pty: new EinsteinPty(credentials)
                });
            }
        })
    );

    // Command to open/focus the Einstein terminal from the command palette
    context.subscriptions.push(
        vscode.commands.registerCommand('einstein.openTerminal', () => {
            vscode.window.createTerminal({
                name: 'Einstein',
                pty: new EinsteinPty(credentials)
            }).show();
        }),

        vscode.commands.registerCommand('einstein.setCredentials', async () => {
            const creds = await credentials.promptAndStore();
            if (creds) {
                vscode.window.showInformationMessage('Einstein: Credentials saved.');
            }
        }),

        vscode.commands.registerCommand('einstein.clearCredentials', async () => {
            const confirm = await vscode.window.showWarningMessage(
                'Clear saved Einstein credentials?',
                { modal: true },
                'Clear'
            );
            if (confirm === 'Clear') {
                await credentials.clear();
                vscode.window.showInformationMessage('Einstein: Credentials cleared.');
            }
        })
    );
}

export function deactivate(): void {}
