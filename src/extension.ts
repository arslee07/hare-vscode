/**
 * @module hare-vscode
 */

import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.languages.registerDocumentSymbolProvider('hare', new HareDocumentSymbolProvider()),
        vscode.commands.registerCommand('hare.goToSymbol', goToSymbol),
        vscode.commands.registerCommand('hare.showDocumentation', showDocumentation),
        vscode.commands.registerCommand('hare.build', createHareTask('build')),
        vscode.commands.registerCommand('hare.test', createHareTask('test')),
        vscode.commands.registerCommand('hare.run', createHareTask('run')),
    );
}

/** 
 * `hare.goToSymbol` command callback.
 */
export async function goToSymbol() {
    const symbol = await vscode.window.showInputBox({
        prompt: 'Enter symbol name (e.g., fmt::println, bufio::init)',
        placeHolder: 'fmt::println'
    });

    if (!symbol) {
        return;
    }

    const { haredocExecutable } = vscode.workspace.getConfiguration('hare')

    try {
        const { stdout } = await execAsync(`${haredocExecutable} -N ${symbol}`);

        const [file, line] = stdout.split(":");
        const line_int = parseInt(line) - 1;

        const document = await vscode.workspace.openTextDocument(file);
        const selection = new vscode.Range(
            new vscode.Position(line_int, 0),
            new vscode.Position(line_int, 0),
        );
        await vscode.window.showTextDocument(document, { selection });
    } catch (error: any) {
        vscode.window.showErrorMessage(
            `Failed to go to symbol: ${error.message}`
        )
    }
}

/** 
 * `hare.showDocumentation` command callback.
 */
export async function showDocumentation() {
    const identifier = await vscode.window.showInputBox({
        prompt: 'Enter indentifier name (e.g., bufio, fmt::println, ./sort.ha)',
        placeHolder: 'fmt::println'
    });

    if (!identifier) {
        return;
    }

    const { haredocExecutable } = vscode.workspace.getConfiguration('hare')

    try {
        const { stdout } = await execAsync(`${haredocExecutable} -F html -t ${identifier}`);
        const panel = vscode.window.createWebviewPanel(
            'haredoc',
            'Haredoc',
            vscode.ViewColumn.Beside,
        )
        panel.webview.html = stdout;
    } catch (error: any) {
        vscode.window.showErrorMessage(`Failed to generate documentation: ${error.message}`)
    }
}

/** 
 * Wrapper for basic task callbacks, e.g. `hare.build`, `hare.test`, etc.
 * @param command - Hare command to execute
 * @returns Command callback.
 */
export function createHareTask(command: string): () => void {
    const { hareExecutable } = vscode.workspace.getConfiguration('hare')

    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
        return () => {
            vscode.window.showErrorMessage("No workspace folder open.");
        };
    }

    return () => {
        const task = new vscode.Task(
            { type: 'shell' },
            folder,
            `Hare ${command}`,
            'shell',
            new vscode.ShellExecution(`${hareExecutable} ${command}`)
        );
        vscode.tasks.executeTask(task);
    }
}

/**
 * Basic, regex-based symbol provider for Hare source files.
 */
export class HareDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
    static patterns: { regex: RegExp; kind: vscode.SymbolKind }[] = [
        { regex: /^(export\s+)?fn\s+([a-zA-Z_][a-zA-Z0-9_]*)/, kind: vscode.SymbolKind.Function },
        { regex: /^@(test|init|fini)\s+fn\s+([a-zA-Z_][a-zA-Z0-9_]+)/, kind: vscode.SymbolKind.Function },
        { regex: /^(export\s+)?type\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*struct\s*\{/, kind: vscode.SymbolKind.Struct },
        { regex: /^(export\s+)?type\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*union\s*\{/, kind: vscode.SymbolKind.Struct },
        { regex: /^(export\s+)?type\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*enum\s+/, kind: vscode.SymbolKind.Enum },
        { regex: /^(export\s+)?type\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*!/, kind: vscode.SymbolKind.TypeParameter },
        { regex: /^(export\s+)?type\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=/, kind: vscode.SymbolKind.TypeParameter },
        { regex: /^(export\s+)?def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*[:=]/, kind: vscode.SymbolKind.Constant },
        { regex: /^(export\s+)?const\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*[:=]/, kind: vscode.SymbolKind.Constant },
        { regex: /^(export\s+)?let\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*[:=]/, kind: vscode.SymbolKind.Variable },
    ];

    provideDocumentSymbols(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.ProviderResult<vscode.SymbolInformation[] | vscode.DocumentSymbol[]> {
        let symbols: vscode.DocumentSymbol[] = [];

        for (let i = 0; i < document.lineCount; i++) {
            const line = document.lineAt(i);
            const text = line.text;

            for (const pattern of HareDocumentSymbolProvider.patterns) {
                const match = pattern.regex.exec(text);
                if (match && match[2]) {
                    const name = match[2];
                    const range = line.range;
                    const selectionRange = new vscode.Range(
                        new vscode.Position(i, match.index + (match[1]?.length || 0)),
                        new vscode.Position(i, match.index + match[0].length)
                    );
                    const symbol = new vscode.DocumentSymbol(name, '', pattern.kind, range, selectionRange)
                    symbols.push(symbol);
                    break;
                }
            }
        }

        return symbols;
    }
}