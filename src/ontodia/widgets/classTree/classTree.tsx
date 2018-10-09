import * as React from 'react';

import { ElementTypeIri, ClassModel } from '../../data/model';
import { DiagramView } from '../../diagram/view';
import { formatLocalizedLabel } from '../../diagram/model';
import { EditorController } from '../../editor/editorController';
import { Debouncer } from '../../viewUtils/async';
import { EventObserver } from '../../viewUtils/events';

import { TreeNode } from './treeModel';
import { Forest } from './leaf';

export interface ClassTreeProps {
    view: DiagramView;
    editor: EditorController;
    onClassSelected: (classId: ElementTypeIri) => void;
}

export interface State {
    roots?: ReadonlyArray<TreeNode>;
    filteredRoots?: ReadonlyArray<TreeNode>;
    requestedSearchText?: string;
    appliedSearchText?: string;
    selectedNode?: TreeNode;
}

const CLASS_NAME = 'ontodia-class-tree';
const MIN_TERM_LENGTH = 3;

export class ClassTree extends React.Component<ClassTreeProps, State> {
    private readonly listener = new EventObserver();
    private readonly delayedClassUpdate = new Debouncer();
    private readonly delayedSearch = new Debouncer(200 /* ms */);

    constructor(props: ClassTreeProps) {
        super(props);
        this.state = {
            roots: [],
            filteredRoots: [],
            requestedSearchText: '',
            appliedSearchText: '',
        };
    }

    render() {
        const {view} = this.props;
        const {requestedSearchText, appliedSearchText, filteredRoots, selectedNode} = this.state;
        const normalizedSearchText = normalizeSearchText(requestedSearchText);
        // highlight search term only if actual tree is already filtered by current or previous term:
        //  - this immediately highlights typed characters thus making it look more responsive,
        //  - prevents expanding non-filtered tree (which can be too large) just to highlight the term
        const searchText = appliedSearchText ? normalizedSearchText : undefined;

        return (
            <div className={CLASS_NAME}>
                <div className={`${CLASS_NAME}__filter`}>
                    <div className={`${CLASS_NAME}__filter-group`}>
                        <input type='text'
                            className='search-input ontodia-form-control'
                            placeholder='Search for...'
                            value={this.state.requestedSearchText}
                            onChange={this.onSearchTextChange}
                        />
                    </div>
                </div>
                <Forest className={`${CLASS_NAME}__tree`}
                    view={view}
                    nodes={filteredRoots}
                    searchText={searchText}
                    selectedNode={selectedNode}
                    onSelect={this.onSelectNode}
                />
            </div>
        );
    }

    componentDidMount() {
        const {view, editor} = this.props;
        this.listener.listen(view.events, 'changeLanguage', () => this.refreshClassTree());
        this.listener.listen(editor.model.events, 'changeClassTree', () => {
            this.refreshClassTree();
        });
        this.listener.listen(editor.model.events, 'classEvent', ({data}) => {
            if (data.changeLabel || data.changeCount) {
                this.delayedClassUpdate.call(this.refreshClassTree);
            }
        });
        this.refreshClassTree();
    }

    componentWillUnmount() {
        this.listener.stopListening();
        this.delayedClassUpdate.dispose();
        this.delayedSearch.dispose();
    }

    private onSearchTextChange = (e: React.FormEvent<HTMLInputElement>) => {
        const requestedSearchText = e.currentTarget.value;
        this.setState({requestedSearchText});
        this.delayedSearch.call(this.performSearch);
    }

    private performSearch = () => {
        const {requestedSearchText, appliedSearchText} = this.state;
        const requested = normalizeSearchText(requestedSearchText);
        if (requested === appliedSearchText) {
            return;
        }

        if (requested.length < MIN_TERM_LENGTH) {
            this.setState((state): State => ({
                appliedSearchText: undefined,
                filteredRoots: state.roots,
            }));
        } else {
            const {view} = this.props;
            this.setState((state): State => ({
                appliedSearchText: requested,
                filteredRoots: filterTree(state.roots, requested, view.getLanguage()),
            }));
        }
    }

    private onSelectNode = (node: TreeNode) => {
        const {onClassSelected} = this.props;
        this.setState({selectedNode: node});
        onClassSelected(node.model.id);
    }

    private refreshClassTree = () => {
        const {editor, view} = this.props;
        const lang = view.getLanguage();

        const mapClass = (model: ClassModel): TreeNode => {
            const richClass = view.model.createClass(model.id);
            return {
                model: richClass,
                label: formatLocalizedLabel(richClass.id, richClass.label, lang),
                derived: model.children.map(mapClass),
            };
        };

        const roots = editor.model.getClasses().map(mapClass);
        this.setState((state): State => {
            const sortedRoots = sortTree(roots, lang);
            const filteredRoots = state.appliedSearchText
                ? filterTree(sortedRoots, state.appliedSearchText, lang)
                : sortedRoots;
            return {roots: sortedRoots, filteredRoots};
        });
    }
}

function normalizeSearchText(text: string) {
    return text.trim().toLowerCase();
}

function sortTree(roots: ReadonlyArray<TreeNode>, lang: string): ReadonlyArray<TreeNode> {
    if (roots.length === 0) {
        return roots;
    }
    const compareByLabel = (left: TreeNode, right: TreeNode) => {
        const leftLabel = formatLocalizedLabel(left.model.id, left.model.label, lang);
        const rightLabel = formatLocalizedLabel(right.model.id, right.model.label, lang);
        return leftLabel.localeCompare(rightLabel);
    };
    const mapped = roots.map(root => TreeNode.setDerived(root, sortTree(root.derived, lang)));
    mapped.sort(compareByLabel);
    return mapped;
}

function filterTree(
    roots: ReadonlyArray<TreeNode>,
    searchText: string,
    lang: string,
): ReadonlyArray<TreeNode> {
    if (roots.length === 0) {
        return roots;
    }
    return roots
        .map(root => TreeNode.setDerived(root, filterTree(root.derived, searchText, lang)))
        .filter(root => {
            if (root.derived.length > 0) {
                // keep parent if children is included
                return true;
            }
            return root.label.toLowerCase().indexOf(searchText) >= 0;
        });
}
