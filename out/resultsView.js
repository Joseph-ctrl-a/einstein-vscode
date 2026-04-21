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
exports.ResultsViewProvider = void 0;
const vscode = __importStar(require("vscode"));
class ResultsViewProvider {
    resolveWebviewView(webviewView) {
        this._view = webviewView;
        webviewView.webview.options = { enableScripts: true };
        webviewView.webview.html = this.idleHtml();
        webviewView.webview.onDidReceiveMessage(msg => {
            if (msg.command === 'openReport') {
                vscode.env.openExternal(vscode.Uri.parse(msg.url));
            }
        });
    }
    showLoading(fileName, module) {
        if (!this._view) {
            return;
        }
        this._view.show(true);
        this._view.webview.html = this.loadingHtml(fileName, module);
    }
    showResults(result) {
        if (!this._view) {
            return;
        }
        this._view.show(true);
        this._view.webview.html = this.resultsHtml(result);
    }
    showError(message) {
        if (!this._view) {
            return;
        }
        this._view.show(true);
        this._view.webview.html = this.errorHtml(message);
    }
    baseStyles() {
        return `
            <style>
                * { box-sizing: border-box; margin: 0; padding: 0; }
                body {
                    font-family: var(--vscode-font-family);
                    font-size: var(--vscode-font-size);
                    background: var(--vscode-sideBar-background);
                    color: var(--vscode-foreground);
                    padding: 12px;
                    line-height: 1.5;
                }
                .header {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    margin-bottom: 14px;
                    padding-bottom: 10px;
                    border-bottom: 1px solid var(--vscode-sideBarSectionHeader-border, var(--vscode-panel-border));
                }
                .header-title {
                    font-size: 1rem;
                    font-weight: 600;
                    flex: 1;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                .badge {
                    background: var(--vscode-badge-background);
                    color: var(--vscode-badge-foreground);
                    padding: 1px 7px;
                    border-radius: 10px;
                    font-size: 0.7rem;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 0.04em;
                    flex-shrink: 0;
                }
                .summary {
                    background: var(--vscode-editor-inactiveSelectionBackground);
                    border-radius: 6px;
                    padding: 10px 12px;
                    margin-bottom: 14px;
                }
                .summary-row {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    margin-bottom: 8px;
                }
                .summary-counts {
                    display: flex;
                    gap: 14px;
                }
                .count {
                    display: flex;
                    align-items: center;
                    gap: 5px;
                    font-weight: 600;
                    font-size: 0.95rem;
                }
                .count .dot {
                    width: 8px;
                    height: 8px;
                    border-radius: 50%;
                }
                .count.pass .dot { background: #4ec9b0; }
                .count.fail .dot { background: #f48771; }
                .count.pass { color: #4ec9b0; }
                .count.fail { color: #f48771; }
                .progress-track {
                    height: 4px;
                    background: var(--vscode-progressBar-background, rgba(255,255,255,0.1));
                    border-radius: 2px;
                    overflow: hidden;
                }
                .progress-fill {
                    height: 100%;
                    background: #4ec9b0;
                    border-radius: 2px;
                    transition: width 0.4s ease;
                }
                .section-label {
                    font-size: 0.7rem;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 0.06em;
                    color: var(--vscode-descriptionForeground);
                    margin-bottom: 6px;
                }
                .test-list {
                    display: flex;
                    flex-direction: column;
                    gap: 3px;
                }
                .test-item {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 6px 8px;
                    border-radius: 4px;
                    cursor: default;
                }
                .test-item:hover {
                    background: var(--vscode-list-hoverBackground);
                }
                .test-icon { font-size: 0.85rem; flex-shrink: 0; }
                .test-name {
                    flex: 1;
                    font-family: var(--vscode-editor-font-family, monospace);
                    font-size: 0.82rem;
                    word-break: break-all;
                }
                .test-pill {
                    font-size: 0.65rem;
                    font-weight: 700;
                    padding: 1px 5px;
                    border-radius: 3px;
                    text-transform: uppercase;
                    flex-shrink: 0;
                }
                .test-pill.pass {
                    background: rgba(78, 201, 176, 0.15);
                    color: #4ec9b0;
                }
                .test-pill.fail {
                    background: rgba(244, 135, 113, 0.15);
                    color: #f48771;
                }
                .report-btn {
                    display: block;
                    width: 100%;
                    margin-top: 14px;
                    padding: 7px 12px;
                    background: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    border-radius: 4px;
                    font-family: var(--vscode-font-family);
                    font-size: 0.85rem;
                    font-weight: 600;
                    cursor: pointer;
                    text-align: center;
                }
                .report-btn:hover {
                    background: var(--vscode-button-hoverBackground);
                }
                .idle-state, .error-state {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    padding: 32px 16px;
                    text-align: center;
                    gap: 10px;
                    color: var(--vscode-descriptionForeground);
                }
                .idle-icon { font-size: 2rem; }
                .idle-title { font-weight: 600; color: var(--vscode-foreground); }
                .idle-desc { font-size: 0.82rem; }
                .spinner {
                    width: 24px; height: 24px;
                    border: 2px solid var(--vscode-progressBar-background, rgba(255,255,255,0.15));
                    border-top-color: var(--vscode-button-background);
                    border-radius: 50%;
                    animation: spin 0.8s linear infinite;
                }
                @keyframes spin { to { transform: rotate(360deg); } }
                .filename {
                    font-family: var(--vscode-editor-font-family, monospace);
                    font-size: 0.8rem;
                    color: var(--vscode-descriptionForeground);
                    word-break: break-all;
                }
                .all-pass-banner {
                    background: rgba(78, 201, 176, 0.1);
                    border: 1px solid rgba(78, 201, 176, 0.3);
                    border-radius: 4px;
                    padding: 6px 10px;
                    font-size: 0.82rem;
                    color: #4ec9b0;
                    font-weight: 600;
                    margin-bottom: 10px;
                    text-align: center;
                }
                .has-fail-banner {
                    background: rgba(244, 135, 113, 0.1);
                    border: 1px solid rgba(244, 135, 113, 0.3);
                    border-radius: 4px;
                    padding: 6px 10px;
                    font-size: 0.82rem;
                    color: #f48771;
                    font-weight: 600;
                    margin-bottom: 10px;
                    text-align: center;
                }
                .raw-toggle {
                    margin-top: 14px;
                    font-size: 0.75rem;
                    color: var(--vscode-descriptionForeground);
                    cursor: pointer;
                    text-decoration: underline;
                    text-align: center;
                    display: block;
                }
                .raw-output {
                    display: none;
                    margin-top: 8px;
                    background: var(--vscode-editor-background);
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 4px;
                    padding: 8px;
                    font-family: var(--vscode-editor-font-family, monospace);
                    font-size: 0.75rem;
                    white-space: pre-wrap;
                    word-break: break-all;
                    max-height: 200px;
                    overflow-y: auto;
                    color: var(--vscode-editor-foreground);
                }
            </style>
        `;
    }
    idleHtml() {
        return `<!DOCTYPE html><html><head>${this.baseStyles()}</head><body>
            <div class="idle-state">
                <div class="idle-icon">⚡</div>
                <div class="idle-title">Einstein</div>
                <div class="idle-desc">Open a file and run<br><strong>Einstein: Submit Active File</strong><br>to see your results here.</div>
            </div>
        </body></html>`;
    }
    loadingHtml(fileName, module) {
        return `<!DOCTYPE html><html><head>${this.baseStyles()}</head><body>
            <div class="idle-state">
                <div class="spinner"></div>
                <div class="idle-title">Submitting…</div>
                <div class="filename">${escHtml(fileName)}</div>
                <div class="idle-desc">Module: <strong>${escHtml(module.toUpperCase())}</strong></div>
            </div>
        </body></html>`;
    }
    resultsHtml(result) {
        const { testResults, passCount, failCount, reportUrl, module, task, fileName, rawOutput } = result;
        const total = testResults.length;
        const pct = total > 0 ? Math.round((passCount / total) * 100) : 0;
        const allPass = failCount === 0 && total > 0;
        const banner = total === 0
            ? ''
            : allPass
                ? `<div class="all-pass-banner">✓ All tests passed!</div>`
                : `<div class="has-fail-banner">✗ ${failCount} test${failCount !== 1 ? 's' : ''} failed</div>`;
        const testItems = testResults.map(t => `
            <div class="test-item">
                <span class="test-icon">${t.passed ? '✓' : '✗'}</span>
                <span class="test-name">${escHtml(t.name)}</span>
                <span class="test-pill ${t.passed ? 'pass' : 'fail'}">${t.passed ? 'pass' : 'fail'}</span>
            </div>
        `).join('');
        const noTests = total === 0
            ? `<div style="color:var(--vscode-descriptionForeground);font-size:0.82rem;padding:8px 0;">No test results found in server response.</div>`
            : '';
        return `<!DOCTYPE html><html><head>${this.baseStyles()}</head><body>
            <div class="header">
                <span class="header-title">${escHtml(task)}</span>
                <span class="badge">${escHtml(module.toUpperCase())}</span>
            </div>

            <div class="filename" style="margin-bottom:12px">${escHtml(fileName)}</div>

            ${banner}

            ${total > 0 ? `
            <div class="summary">
                <div class="summary-row">
                    <div class="summary-counts">
                        <span class="count pass"><span class="dot"></span>${passCount} passed</span>
                        <span class="count fail"><span class="dot"></span>${failCount} failed</span>
                    </div>
                    <span style="font-size:0.8rem;color:var(--vscode-descriptionForeground)">${pct}%</span>
                </div>
                <div class="progress-track">
                    <div class="progress-fill" style="width:${pct}%"></div>
                </div>
            </div>

            <div class="section-label">Tests (${total})</div>
            <div class="test-list">${testItems}</div>
            ` : noTests}

            <button class="report-btn" onclick="openReport()">View Full Report</button>

            <span class="raw-toggle" onclick="toggleRaw()">Show raw output</span>
            <pre class="raw-output" id="raw">${escHtml(rawOutput)}</pre>

            <script>
                const vscode = acquireVsCodeApi();
                function openReport() {
                    vscode.postMessage({ command: 'openReport', url: '${escHtml(reportUrl)}' });
                }
                function toggleRaw() {
                    const el = document.getElementById('raw');
                    el.style.display = el.style.display === 'block' ? 'none' : 'block';
                }
            </script>
        </body></html>`;
    }
    errorHtml(message) {
        return `<!DOCTYPE html><html><head>${this.baseStyles()}</head><body>
            <div class="error-state">
                <div class="idle-icon">⚠</div>
                <div class="idle-title">Submission Failed</div>
                <div class="idle-desc">${escHtml(message)}</div>
            </div>
        </body></html>`;
    }
}
exports.ResultsViewProvider = ResultsViewProvider;
ResultsViewProvider.viewType = 'einstein.resultsView';
function escHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
