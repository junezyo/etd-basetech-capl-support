import * as vscode from 'vscode';

let outputChannel: vscode.OutputChannel;
let provider: CAPLOutlineProvider;

export function activate(context: vscode.ExtensionContext) {
    outputChannel = vscode.window.createOutputChannel('CAPL Extension');
    outputChannel.appendLine('CAPL extension is now active!');
    
    provider = new CAPLOutlineProvider();
    vscode.window.registerTreeDataProvider('caplOutline', provider);
    vscode.commands.registerCommand('caplOutline.refresh', () => provider.refresh());
    vscode.commands.registerCommand('caplOutline.sortByPosition', () => {
        provider.setSortOrder('position');
        vscode.workspace.getConfiguration('caplOutline').update('sortOrder', 'position', true);
    });
    vscode.commands.registerCommand('caplOutline.sortByAlphabetical', () => {
        provider.setSortOrder('alphabetical');
        vscode.workspace.getConfiguration('caplOutline').update('sortOrder', 'alphabetical', true);
    });

    // 监听配置变化
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('caplOutline.sortOrder')) {
                const config = vscode.workspace.getConfiguration('caplOutline');
                const sortOrder = config.get('sortOrder', 'position') as 'position' | 'alphabetical';
                provider.setSortOrder(sortOrder);
            }
        })
    );

    // 监听文件切换事件
    vscode.window.onDidChangeActiveTextEditor(editor => {
        if (editor && (editor.document.fileName.endsWith('.can') || editor.document.fileName.endsWith('.cin'))) {
            provider.refresh();
        }
    });

    // 监听文件内容变化事件
    vscode.workspace.onDidChangeTextDocument(event => {
        if (event.document.fileName.endsWith('.can') || event.document.fileName.endsWith('.cin')) {
            provider.refresh();
        }
    });
}

class CAPLOutlineProvider implements vscode.TreeDataProvider<FunctionItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<FunctionItem | undefined | null | void> = new vscode.EventEmitter<FunctionItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<FunctionItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private sortOrder: 'position' | 'alphabetical' = 'position';

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    setSortOrder(order: 'position' | 'alphabetical'): void {
        if (this.sortOrder !== order) {
            this.sortOrder = order;
            this.refresh();
        }
    }

    getTreeItem(element: FunctionItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: FunctionItem): Thenable<FunctionItem[]> {
        if (element) {
            return Promise.resolve([]);
        } else {
            return this.getFunctions();
        }
    }

    private async getFunctions(): Promise<FunctionItem[]> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return [];
        }

        const document = editor.document;
        if (!document.fileName.endsWith('.can') && !document.fileName.endsWith('.cin')) {
            return [];
        }

        const text = document.getText();
        const functions: FunctionItem[] = [];

        // 更精确的函数匹配正则表达式，包含参数和返回值类型
        const functionRegex = /(?:^|\s)(void|long|int|float|double|char|byte|word|dword|qword|message|timer|msTimer|environment|sysvar|sysvar_float|sysvar_string)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^)]*)\)/gm;
        let match;
        while ((match = functionRegex.exec(text)) !== null) {
            const line = document.positionAt(match.index).line;
            const range = new vscode.Range(line, 0, line, match[0].length);
            const returnType = match[1];
            const functionName = match[2];
            const parameters = match[3].trim();
            functions.push(new FunctionItem(functionName, returnType, range, parameters));
        }

        // 根据当前排序方式排序
        if (this.sortOrder === 'alphabetical') {
            functions.sort((a, b) => a.label.localeCompare(b.label));
        } else {
            functions.sort((a, b) => a.range.start.line - b.range.start.line);
        }

        return functions;
    }
}

class FunctionItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly returnType: string,
        public readonly range: vscode.Range,
        public readonly parameters: string
    ) {
        super(label, vscode.TreeItemCollapsibleState.None);
        // 提取参数类型
        const paramTypes = this.extractParamTypes(parameters);
        // 设置显示格式：函数名称(参数类型1，参数类型2)：返回值类型
        this.label = `${label}(${paramTypes.join(', ')}) : ${returnType}`;
        this.tooltip = `${label}(${parameters}) : ${returnType}`;
        this.command = {
            command: 'vscode.open',
            title: 'Go to function',
            arguments: [vscode.Uri.file(vscode.window.activeTextEditor?.document.uri.fsPath || ''), { selection: range }]
        };
        this.iconPath = new vscode.ThemeIcon('symbol-method');
    }

    private extractParamTypes(parameters: string): string[] {
        if (!parameters.trim()) {
            return [];
        }
        // 分割参数列表
        const params = parameters.split(',').map(p => p.trim());
        // 提取每个参数的类型
        return params.map(param => {
            // 匹配基本类型和结构体类型
            const typeMatch = param.match(/^(void|long|int|float|double|char|byte|word|dword|qword|message|timer|msTimer|environment|sysvar|sysvar_float|sysvar_string|struct\s+[a-zA-Z_][a-zA-Z0-9_]*)\b/);
            if (typeMatch) {
                // 如果是结构体，确保格式为 "struct + 结构体名"
                return typeMatch[1].replace(/\s+/g, ' ');
            }
            return 'unknown';
        });
    }
} 