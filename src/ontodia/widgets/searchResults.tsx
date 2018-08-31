import * as React from 'react';

import { Dictionary, ElementModel, ElementIri } from '../data/model';
import { DiagramView } from '../diagram/view';
import { cloneSet } from '../viewUtils/collections';
import { EventObserver } from '../viewUtils/events';
import { ListElementView, startDragElements } from './listElementView';

const CLASS_NAME = 'ontodia-search-results';

export interface SearchResultProps {
    view: DiagramView;
    items: ReadonlyArray<ElementModel>;
    selection: ReadonlySet<ElementIri>;
    onSelectionChanged: (newSelection: ReadonlySet<ElementIri>) => void;
    highlightText?: string;
}

const enum Direction { Up, Down }

export class SearchResults extends React.Component<SearchResultProps, {}> {
    private readonly listener = new EventObserver();

    private root: HTMLElement;

    private startSelection = 0;
    private endSelection = 0;

    constructor(props: SearchResultProps) {
        super(props);
        this.state = {
            selection: props.selection || {},
        };
    }

    render(): React.ReactElement<any> {
        const items = this.props.items || [];
        return <ul className={CLASS_NAME}
            ref={this.onRootMount}
            tabIndex={-1}
            onFocus={this.addKeyListener}
            onBlur={this.removeKeyListener}>
            {items.map(this.renderResultItem)}
        </ul>;
    }

    private onRootMount = (root: HTMLElement) => {
        this.root = root;
    }

    private renderResultItem = (model: ElementModel) => {
        const alreadyOnDiagram = this.isOnDiagram(model);
        return (
            <ListElementView
                key={model.id}
                model={model}
                view={this.props.view}
                highlightText={this.props.highlightText}
                disabled={alreadyOnDiagram}
                selected={this.props.selection.has(model.id)}
                onClick={alreadyOnDiagram ? undefined : this.onItemClick}
                onDragStart={e => {
                    const {selection} = this.props;
                    const iris: ElementIri[] = [];
                    selection.forEach(iri => iris.push(iri));
                    if (!selection.has(model.id)) {
                        iris.push(model.id);
                    }
                    return startDragElements(e, iris);
                }}
            />
        );
    }

    componentDidMount() {
        this.listener.listen(this.props.view.model.events, 'changeCells', () => {
            const {items, selection} = this.props;

            if (selection.size === 0) {
                if (items && items.length > 0) {
                    // redraw "already on diagram" state
                    this.forceUpdate();
                }
            } else {
                const newSelection = cloneSet(selection);
                for (const element of this.props.view.model.elements) {
                    if (element.group === undefined && selection.has(element.iri)) {
                        newSelection.delete(element.iri);
                    }
                }
                this.updateSelection(newSelection);
            }
        });
    }

    componentWillReceiveProps(props: SearchResultProps) {
        this.setState({selection: props.selection || {}});
    }

    componentWillUnmount() {
        this.removeKeyListener();
        this.listener.stopListening();
    }

    private updateSelection(selection: ReadonlySet<ElementIri>) {
        const {onSelectionChanged} = this.props;
        onSelectionChanged(selection);
    }

    private addKeyListener = () => {
        document.addEventListener('keydown', this.onKeyUp);
    }

    private removeKeyListener = () => {
        document.removeEventListener('keydown', this.onKeyUp);
    }

    private onKeyUp = (event: KeyboardEvent) => {
        const {items} = this.props;
        const isPressedUp = event.keyCode === 38 || event.which === 38;
        const isPressDown = event.keyCode === 40 || event.which === 40;

        if (isPressedUp || isPressDown) {
            if (event.shiftKey) { // select range
                if (isPressedUp) {
                    this.endSelection = this.getNextIndex(this.endSelection, Direction.Up);
                } else if (isPressDown) {
                    this.endSelection = this.getNextIndex(this.endSelection, Direction.Down);
                }
                const startIndex = Math.min(this.startSelection, this.endSelection);
                const finishIndex = Math.max(this.startSelection, this.endSelection);
                const selection = this.selectRange(startIndex, finishIndex);

                this.updateSelection(selection);
                this.focusOn(this.endSelection);
            } else { // change focus
                const startIndex = Math.min(this.startSelection, this.endSelection);
                const finishIndex = Math.max(this.startSelection, this.endSelection);

                if (isPressedUp) {
                    this.startSelection = this.getNextIndex(startIndex, Direction.Up);
                } else if (isPressDown) {
                    this.startSelection = this.getNextIndex(finishIndex, Direction.Down);
                }
                this.endSelection = this.startSelection;

                const focusElement = items[this.startSelection];
                const newSelection = new Set<ElementIri>();
                newSelection.add(focusElement.id);

                this.updateSelection(newSelection);
                this.focusOn(this.startSelection);
            }
        }
        event.preventDefault();
    }

    private onItemClick = (event: React.MouseEvent<any>, model: ElementModel) => {
        event.preventDefault();

        const {items, selection, onSelectionChanged} = this.props;
        const previouslySelected = selection.has(model.id);
        const modelIndex = items.indexOf(model);

        let newSelection: Set<ElementIri>;

        if (event.shiftKey && this.startSelection !== -1) { // select range
            const start = Math.min(this.startSelection, modelIndex);
            const end = Math.max(this.startSelection, modelIndex);
            newSelection = this.selectRange(start, end);
        } else {
            this.endSelection = this.startSelection = modelIndex;
            const ctrlKey = event.ctrlKey || event.metaKey;

            if (ctrlKey) { // select/deselect
                newSelection = cloneSet(selection);
                if (selection.has(model.id)) {
                    newSelection.delete(model.id);
                } else {
                    newSelection.add(model.id);
                }
            } else { // single click
                newSelection = new Set<ElementIri>();
                newSelection.add(model.id);
            }
        }

        onSelectionChanged(newSelection);
    }

    private selectRange(start: number, end: number): Set<ElementIri> {
        const {items} = this.props;
        const selection = new Set<ElementIri>();
        for (let i = start; i <= end; i++) {
            const selectedModel = items[i];
            if (!this.isOnDiagram(selectedModel)) {
                selection.add(selectedModel.id);
            }
        }
        return selection;
    }

    private getNextIndex(curIndex: number, direction: Direction) {
        const items = this.props.items;
        const step = direction === Direction.Up ? -1 : 1;
        for (let i = curIndex + step; i !== curIndex; i += step) {
            if (i < 0) {
                i = items.length - 1;
            }
            if (i >= items.length) {
                i = 0;
            }
            if (!this.isOnDiagram(items[i])) {
                return i;
            }
        }
        return 0;
    }

    private isOnDiagram(model: ElementModel): boolean {
        return this.props.view.model.elements.findIndex(
            element => element.iri === model.id && element.group === undefined
        ) >= 0;
    }

    private focusOn(index: number) {
        const container = this.root.parentElement;
        const item = this.root.children.item(index) as HTMLElement;

        const rootOffset = container.clientTop + container.offsetTop;
        const minPosition = container.scrollTop + rootOffset;
        const itemTopOffset = item.offsetTop;
        if (itemTopOffset < minPosition) {
            container.scrollTop = itemTopOffset - rootOffset;
        }

        const maxPosition = minPosition + container.clientHeight;
        const itemBottomOffset = item.offsetTop + item.clientHeight;
        if (itemBottomOffset > maxPosition) {
            container.scrollTop = itemBottomOffset - container.clientHeight - rootOffset;
        }

        item.focus();
    }
}
