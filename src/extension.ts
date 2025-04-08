import * as vscode from 'vscode';

let outputChannel: vscode.OutputChannel;
let provider: CAPLOutlineProvider;

// ����
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

// ������
class GroupItem extends OutlineItem {
    constructor(
        label: string,
        public readonly groupType: string
    ) {
        // Ϊ���鴴��һ������ķ�Χ
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
        // �ָ�����б�
        const params = parameters.split(',').map(p => p.trim());
        // ��ȡÿ������������
        return params.map(param => {
            // ƥ��������ͺͽṹ������
            const typeMatch = param.match(/^(void|long|int|float|double|char|byte|word|dword|qword|message|timer|msTimer|environment|sysvar|sysvar_float|sysvar_string|struct\s+[a-zA-Z_][a-zA-Z0-9_]*)\b/);
            if (typeMatch) {
                // ����ǽṹ�壬ȷ����ʽΪ "struct + �ṹ����"
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
        // ���������Ĳ����ͷ���ֵ�ǹ̶��ģ��ղ���������ֵΪ void
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

    // �������ñ仯
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('caplOutline.sortOrder')) {
                const config = vscode.workspace.getConfiguration('caplOutline');
                const sortOrder = config.get('sortOrder', 'position') as 'position' | 'alphabetical';
                provider.setSortOrder(sortOrder);
            }
        })
    );

    // �����ļ��л��¼�
    vscode.window.onDidChangeActiveTextEditor(editor => {
        if (editor && (editor.document.fileName.endsWith('.can') || editor.document.fileName.endsWith('.cin'))) {
            provider.refresh();
        }
    });

    // �����ļ����ݱ仯�¼�
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
            // ���ڵ㣺������������
            return Promise.resolve([
                new GroupItem('Test Cases', 'testcase'),
                new GroupItem('Functions', 'function')
            ]);
        } else if (element instanceof GroupItem) {
            // ����ڵ㣺���ض�Ӧ���͵���Ŀ
            return this.getGroupItems(element.groupType);
        } else {
            // Ҷ�ӽڵ㣺û���ӽڵ�
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
            // ʶ�������ų� if��while��for �ȿ������
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
            // ʶ�� testcase
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

        // ���ݵ�ǰ����ʽ����
        if (this.sortOrder === 'alphabetical') {
            items.sort((a, b) => a.label.localeCompare(b.label));
        } else {
            items.sort((a, b) => a.range.start.line - b.range.start.line);
        }

        return items;
    }
} 