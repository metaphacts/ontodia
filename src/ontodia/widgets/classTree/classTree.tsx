import * as React from 'react';

import { ElementTypeIri, ClassModel } from '../../data/model';
import { formatLocalizedLabel } from '../../diagram/model';
import { Vector } from '../../diagram/geometry';
import { DiagramView } from '../../diagram/view';
import { EditorController } from '../../editor/editorController';
import { Cancellation, CancellationToken, Debouncer } from '../../viewUtils/async';
import { cloneMap } from '../../viewUtils/collections';
import { EventObserver } from '../../viewUtils/events';
import { ProgressBar, ProgressState } from '../../widgets/progressBar';

import { TreeNode } from './treeModel';
import { Forest } from './leaf';

export interface ClassTreeProps {
    view: DiagramView;
    editor: EditorController;
    onClassSelected: (classId: ElementTypeIri) => void;
    onCreateInstance: (classId: ElementTypeIri, position?: Vector) => void;
}

export interface State {
    refreshingState?: ProgressState;
    roots?: ReadonlyArray<TreeNode>;
    filteredRoots?: ReadonlyArray<TreeNode>;
    requestedSearchText?: string;
    appliedSearchText?: string;
    selectedNode?: TreeNode;
    constructibleClasses?: ReadonlyMap<ElementTypeIri, boolean>;
    showOnlyConstructible?: boolean;
}

const CLASS_NAME = 'ontodia-class-tree';
const MIN_TERM_LENGTH = 3;

export class ClassTree extends React.Component<ClassTreeProps, State> {
    private readonly listener = new EventObserver();
    private readonly delayedClassUpdate = new Debouncer();
    private readonly delayedSearch = new Debouncer(200 /* ms */);

    private refreshOperation = new Cancellation();

    constructor(props: ClassTreeProps) {
        super(props);
        this.state = {
            refreshingState: ProgressState.none,
            roots: [],
            filteredRoots: [],
            requestedSearchText: '',
            appliedSearchText: '',
            constructibleClasses: new Map(),
            showOnlyConstructible: false,
        };
    }

    render() {
        const {view, editor} = this.props;
        const {
            refreshingState, requestedSearchText, appliedSearchText, filteredRoots, selectedNode, constructibleClasses,
            showOnlyConstructible
        } = this.state;
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
                        {editor.inAuthoringMode ? (
                            <label className={`${CLASS_NAME}__only-creatable`}>
                                <input type='checkbox'
                                    checked={showOnlyConstructible}
                                    onChange={this.onShowOnlyCreatableChange}
                                /> Show only constructible
                            </label>
                        ) : null}
                    </div>
                </div>
                <ProgressBar state={refreshingState} />
                <Forest className={`${CLASS_NAME}__tree ontodia-scrollable`}
                    view={view}
                    nodes={filteredRoots}
                    searchText={searchText}
                    selectedNode={selectedNode}
                    onSelect={this.onSelectNode}
                    creatableClasses={constructibleClasses}
                    onClickCreate={this.onCreateInstance}
                    onDragCreate={this.onDragCreate}
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
        const {requestedSearchText} = this.state;
        const requested = normalizeSearchText(requestedSearchText);
        if (requested === this.state.appliedSearchText) {
            return;
        }

        const appliedSearchText = requested.length < MIN_TERM_LENGTH ? undefined : requested;
        this.setState((state): State => applyFilters(
            {...state, appliedSearchText}
        ));
    }

    private onShowOnlyCreatableChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        this.setState((state): State => applyFilters(
            {...state, showOnlyConstructible: !state.showOnlyConstructible}
        ));
    }

    private onSelectNode = (node: TreeNode) => {
        const {onClassSelected} = this.props;
        this.setState({selectedNode: node});
        onClassSelected(node.model.id);
    }

    private onCreateInstance = (node: TreeNode) => {
        const {onCreateInstance} = this.props;
        onCreateInstance(node.model.id);
    }

    private onDragCreate = (node: TreeNode) => {
        const {view, onCreateInstance} = this.props;
        view.setHandlerForNextDropOnPaper(e => {
            onCreateInstance(node.model.id, e.paperPosition);
        });
    }

    private refreshClassTree = () => {
        const cancellation = new Cancellation();
        this.refreshOperation.abort();
        this.refreshOperation = cancellation;

        this.setState((state, props): State => {
            const {editor, view} = props;
            const lang = view.getLanguage();

            const mapClass = (model: ClassModel): TreeNode => {
                const richClass = view.model.createClass(model.id);
                return {
                    model: richClass,
                    label: formatLocalizedLabel(richClass.id, richClass.label, lang),
                    derived: model.children.map(mapClass),
                };
            };

            let refreshingState = ProgressState.none;
            if (editor.inAuthoringMode) {
                const requestedClasses = new Set<ElementTypeIri>();
                const searchClass = (model: ClassModel) => {
                    if (!state.constructibleClasses.has(model.id)) {
                        requestedClasses.add(model.id);
                    }
                    model.children.forEach(searchClass);
                };
                editor.model.getClasses().forEach(searchClass);

                if (requestedClasses.size > 0) {
                    refreshingState = ProgressState.loading;
                    this.queryCreatableTypes(requestedClasses, cancellation.signal);
                }
            }

            const roots = editor.model.getClasses().map(mapClass);
            const sortedRoots = sortTree(roots, lang);
            return applyFilters({...state, roots: sortedRoots, refreshingState});
        });
    }

    private async queryCreatableTypes(classes: Set<ElementTypeIri>, ct: CancellationToken) {
        try {
            const result = await this.props.editor.metadataApi.filterConstructibleTypes(classes, ct);
            if (ct.aborted) { return; }
            this.setState((state): State => {
                const constructibleClasses = cloneMap(state.constructibleClasses);
                classes.forEach(type => {
                    constructibleClasses.set(type, result.has(type));
                });
                return applyFilters({...state, constructibleClasses, refreshingState: ProgressState.completed});
            });
        } catch (err) {
            // tslint:disable-next-line:no-console
            console.error(err);
            if (ct.aborted) { return; }
            this.setState((state): State => applyFilters({...state, refreshingState: ProgressState.error}));
        }
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

function applyFilters(state: State): State {
    let filteredRoots = state.roots;
    if (state.appliedSearchText) {
        filteredRoots = filterByKeyword(filteredRoots, state.appliedSearchText);
    }
    if (state.showOnlyConstructible) {
        filteredRoots = filterOnlyCreatable(filteredRoots, state.constructibleClasses);
    }
    return {...state, filteredRoots};
}

function filterByKeyword(roots: ReadonlyArray<TreeNode>, searchText: string): ReadonlyArray<TreeNode> {
    if (roots.length === 0) {
        return roots;
    }
    function collectByKeyword(acc: TreeNode[], node: TreeNode) {
        const derived = node.derived.reduce(collectByKeyword, []);
        // keep parent if children is included or label contains keyword
        if (derived.length > 0 || node.label.toLowerCase().indexOf(searchText) >= 0) {
            acc.push(TreeNode.setDerived(node, derived));
        }
        return acc;
    }
    return roots.reduce(collectByKeyword, []);
}

function filterOnlyCreatable(
    roots: ReadonlyArray<TreeNode>,
    creatableClasses: ReadonlyMap<ElementTypeIri, boolean>
): ReadonlyArray<TreeNode> {
    function collectOnlyCreatable(acc: TreeNode[], node: TreeNode) {
        const derived = node.derived.reduce(collectOnlyCreatable, []);
        if (derived.length > 0 || creatableClasses.get(node.model.id)) {
            acc.push(TreeNode.setDerived(node, derived));
        }
        return acc;
    }
    return roots.reduce(collectOnlyCreatable, []);
}
