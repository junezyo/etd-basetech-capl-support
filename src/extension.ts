import * as vscode from 'vscode';

let outputChannel: vscode.OutputChannel;
let provider: CAPLOutlineProvider;

// 基类
abstract class OutlineItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly range: vscode.Range
    ) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.command = {
            command: 'vscode.open',
            title: 'Go to item',
            arguments: [vscode.Uri.file(vscode.window.activeTextEditor?.document.uri.fsPath || ''), { selection: range }]
        };
    }
}

// 分组项
class GroupItem extends OutlineItem {
    constructor(
        label: string,
        public readonly groupType: string
    ) {
        // 为分组创建一个虚拟的范围
        const dummyRange = new vscode.Range(0, 0, 0, 0);
        super(label, dummyRange);
        this.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
        this.contextValue = 'group';
        this.iconPath = groupType === 'testcase' ? 
            new vscode.ThemeIcon('beaker') : 
            new vscode.ThemeIcon('symbol-method');
    }
}

class FunctionItem extends OutlineItem {
    constructor(
        functionName: string,
        public readonly returnType: string,
        range: vscode.Range,
        public readonly parameters: string
    ) {
        const paramTypes = FunctionItem.extractParamTypes(parameters);
        const displayLabel = `${functionName}(${paramTypes.join(', ')}) : ${returnType}`;
        super(displayLabel, range);
        this.tooltip = `${functionName}(${parameters}) : ${returnType}`;
        this.iconPath = new vscode.ThemeIcon('symbol-method');
    }

    private static extractParamTypes(parameters: string): string[] {
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

class TestCaseItem extends OutlineItem {
    constructor(
        testcaseName: string,
        range: vscode.Range,
        isExported: boolean
    ) {
        // 测试用例的参数和返回值是固定的：空参数，返回值为 void
        const displayLabel = `${testcaseName}() : void`;
        super(displayLabel, range);
        this.tooltip = `${isExported ? 'Exported ' : ''}Testcase: ${testcaseName}() : void`;
        this.iconPath = new vscode.ThemeIcon('beaker');
        this.contextValue = 'testcase';
    }
}

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

class CAPLOutlineProvider implements vscode.TreeDataProvider<OutlineItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<OutlineItem | undefined | null | void> = new vscode.EventEmitter<OutlineItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<OutlineItem | undefined | null | void> = this._onDidChangeTreeData.event;

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

    getTreeItem(element: OutlineItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: OutlineItem): Thenable<OutlineItem[]> {
        if (!element) {
            // 根节点：返回两个分组
            return Promise.resolve([
                new GroupItem('Test Cases', 'testcase'),
                new GroupItem('Functions', 'function')
            ]);
        } else if (element instanceof GroupItem) {
            // 分组节点：返回对应类型的项目
            return this.getGroupItems(element.groupType);
        } else {
            // 叶子节点：没有子节点
            return Promise.resolve([]);
        }
    }

    private async getGroupItems(groupType: string): Promise<OutlineItem[]> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return [];
        }

        const document = editor.document;
        if (!document.fileName.endsWith('.can') && !document.fileName.endsWith('.cin')) {
            return [];
        }

        const text = document.getText();
        const items: OutlineItem[] = [];

        if (groupType === 'function') {
            // 识别函数，排除 if、while、for 等控制语句
            const functionRegex = /(?:^|\s)(?<!if|while|for|switch|elseif)(?:\s*)(void|long|int|float|double|char|byte|word|dword|qword|message|timer|msTimer|environment|sysvar|sysvar_float|sysvar_string)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^)]*)\)\s*{/gm;
            let match;
            while ((match = functionRegex.exec(text)) !== null) {
                const line = document.positionAt(match.index).line;
                const range = new vscode.Range(line, 0, line, match[0].length);
                const returnType = match[1];
                const functionName = match[2];
                const parameters = match[3].trim();
                items.push(new FunctionItem(functionName, returnType, range, parameters));
            }
        } else if (groupType === 'testcase') {
            // 识别 testcase
            const testcaseRegex = /(?:^|\s)(?:export\s+)?testcase\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(\s*\)\s*\{/gm;
            let match;
            while ((match = testcaseRegex.exec(text)) !== null) {
                const line = document.positionAt(match.index).line;
                const range = new vscode.Range(line, 0, line, match[0].length);
                const testcaseName = match[1];
                const isExported = match[0].includes('export');
                items.push(new TestCaseItem(testcaseName, range, isExported));
            }
        }

        // 根据当前排序方式排序
        if (this.sortOrder === 'alphabetical') {
            items.sort((a, b) => a.label.localeCompare(b.label));
        } else {
            items.sort((a, b) => a.range.start.line - b.range.start.line);
        }

        return items;
    }
} 