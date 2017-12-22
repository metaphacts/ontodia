import * as React from 'react';
import * as _ from 'lodash';

import { Dictionary, LocalizedString } from '../data/model';
import { FatClassModel } from '../diagram/elements';
import { DiagramView } from '../diagram/view';
import { EventObserver } from '../viewUtils/events';

// bundling jstree to solve issues with multiple jquery packages,
// when jstree sets itself as plugin to wrong version of jquery
const jstreeJQuery = require<JQueryStatic>('exports?require("jquery")!jstree');
require('jstree/dist/themes/default/style.css');

export interface ClassTreeProps {
    view: DiagramView;
    onClassSelected: (classId: string) => void;
}

interface ClassTreeElement {
    id: string;
    label: ReadonlyArray<LocalizedString>;
    count: number;
    children: ClassTreeElement[];
    a_attr?: {
        href: string;
        draggable: boolean;
    };
    text?: string;
    type?: string;
}

const CLASS_NAME = 'ontodia-class-tree';

export class ClassTree extends React.Component<ClassTreeProps, {}> {
    private readonly listener = new EventObserver();

    private treeRoot: HTMLElement;
    private jsTree: JQuery;

    componentDidMount() {
        this.jsTree.jstree({
            'plugins': ['types', 'sort', 'search'],
            'sort': function (this: any, firstClassId: string, secondClassId: string) {
                const first: ClassTreeElement = this.get_node(firstClassId);
                const second: ClassTreeElement = this.get_node(secondClassId);
                return first.text.localeCompare(second.text);
            },
            'search': {
                'case_insensitive': true,
                'show_only_matches': true,
            },
        });

        this.refreshClassTree();

        this.jsTree.on('select_node.jstree', (e, data) => {
            const {onClassSelected} = this.props;
            onClassSelected(data.selected[0]);
        });

        const {view} = this.props;
        this.listener.listen(view.events, 'changeLanguage', () => this.refreshClassTree());
        this.listener.listen(view.model.events, 'loadingSuccess', () => {
            this.refreshClassTree();
        });
    }

    componentWillUnmount() {
        this.listener.stopListening();
    }

    render() {
        return (
            <div className={CLASS_NAME}>
                <div className={`${CLASS_NAME}__filter`}>
                    <div className={`${CLASS_NAME}__filter-group`}>
                        <input type='text'
                            className='search-input ontodia-form-control'
                            placeholder='Search for...'
                            defaultValue=''
                            onKeyUp={this.onSearchKeyup}
                        />
                    </div>
                </div>
                <div className={`${CLASS_NAME}__rest`}>
                    <div ref={this.onTreeRootMount}
                        className={`${CLASS_NAME}__tree`}>
                    </div>
                </div>
            </div>
        );
    }

    private onSearchKeyup = (e: React.KeyboardEvent<HTMLInputElement>) => {
        const searchString = e.currentTarget.value;
        this.jsTree.jstree('search', searchString);
    }

    private onTreeRootMount = (treeRoot: HTMLElement) => {
        this.treeRoot = treeRoot;
        this.jsTree = jstreeJQuery(this.treeRoot);
    }

    private refreshClassTree() {
        const {view} = this.props;
        const iconMap: Dictionary<{ icon: string }> = {
            'default': {icon: 'default-tree-icon'},
            'has-not-children': {icon: 'default-tree-icon'},
            'has-children': {icon: 'parent-tree-icon'},
        };
        const roots = view.model.getClasses().filter(model => !model.base);
        const mapped = roots.map(root => mapClass(root, view, iconMap));

        const jsTree = this.jsTree.jstree(true);
        (jsTree as any).settings.core.data = mapped;
        (jsTree as any).settings.types = iconMap;
        jsTree.refresh(/* do not show loading indicator */ true, undefined);
    }
}

function mapClass(
    classModel: FatClassModel,
    view: DiagramView,
    iconMap: Dictionary<{ icon: string }>,
): ClassTreeElement {
    const {id, label, count, derived} = classModel;
    const children = derived.map(child => mapClass(child, view, iconMap));
    const {icon} = view.getTypeStyle([id]);

    const text = view.getLocalizedText(label).text + (Number.isNaN(count) ? '' : ` (${count})`);

    let iconId: string | undefined;
    if (icon) {
        iconId = _.uniqueId('iconId');
        iconMap[iconId] = {icon: icon + ' ontodia-tree-icon'};
    }
    const type = iconId || (children.length > 0 ? 'has-children' : 'has-not-children');

    return {
        id,
        label,
        count,
        children,
        a_attr: {href: '#' + id, draggable: true},
        text,
        type,
    };
}

export default ClassTree;
