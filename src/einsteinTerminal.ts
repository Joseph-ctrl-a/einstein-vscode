import * as vscode from "vscode";
import { CredentialManager } from "./credentialManager";
import { createTerminal } from "./terminal";

export class EinsteinPty implements vscode.Pseudoterminal {
  private writeEmitter = new vscode.EventEmitter<string>();
  onDidWrite = this.writeEmitter.event;

  private terminal = createTerminal(this.credentials, (text) =>
    this.writeEmitter.fire(text)
  );

  constructor(private readonly credentials: CredentialManager) {}

  open(): void {
    this.terminal.output.banner();
    this.terminal.output.prompt();
  }

  close(): void {}

  handleInput(data: string): void {
    this.terminal.input.handle(data);
  }
}
