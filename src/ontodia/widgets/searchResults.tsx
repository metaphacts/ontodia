import * as React from 'react';

import { ElementModel, ElementIri } from '../data/model';
import { DiagramView } from '../diagram/view';
import { cloneSet } from '../viewUtils/collections';
import { Debouncer } from '../viewUtils/async';
import { EventObserver } from '../viewUtils/events';
import { ListElementView, startDragElements } from './listElementView';

const CLASS_NAME = 'ontodia-search-results';

export interface SearchResultProps {
    view: DiagramView;
    items: ReadonlyArray<ElementModel>;
    selection: ReadonlySet<ElementIri>;
    onSelectionChanged: (newSelection: ReadonlySet<ElementIri>) => void;
    highlightText?: string;
    /** @default true */
    useDragAndDrop?: boolean;
}

const enum Direction { Up, Down }

export class SearchResults extends React.Component<SearchResultProps, {}> {
    static defaultProps: Partial<SearchResultProps> = {
        useDragAndDrop: true,
    };

    private readonly listener = new EventObserver();
    private readonly delayedChangeCells = new Debouncer();

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
        const {useDragAndDrop} = this.props;
        const canBeSelected = this.canBeSelected(model);
        return (
            <ListElementView
                key={model.id}
                model={model}
                view={this.props.view}
                highlightText={this.props.highlightText}
                disabled={!canBeSelected}
                selected={this.props.selection.has(model.id)}
                onClick={canBeSelected ? this.onItemClick : undefined}
                onDragStart={useDragAndDrop ? e => {
                    const {selection} = this.props;
                    const iris: ElementIri[] = [];
                    selection.forEach(iri => iris.push(iri));
                    if (!selection.has(model.id)) {
                        iris.push(model.id);
                    }
                    return startDragElements(e, iris);
                } : undefined}
            />
        );
    }

    componentDidMount() {
        this.listener.listen(this.props.view.model.events, 'changeCells', () => {
            this.delayedChangeCells.call(this.onChangeCells);
        });
    }

    private onChangeCells = () => {
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
    }

    componentWillReceiveProps(props: SearchResultProps) {
        this.setState({selection: props.selection || {}});
    }

    componentWillUnmount() {
        this.removeKeyListener();
        this.listener.stopListening();
        this.delayedChangeCells.dispose();
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
            if (this.canBeSelected(selectedModel)) {
                selection.add(selectedModel.id);
            }
        }
        return selection;
    }

    private getNextIndex(startIndex: number, direction: Direction) {
        const {items} = this.props;
        if (items.length === 0) {
            return startIndex;
        }
        const indexDelta = direction === Direction.Up ? -1 : 1;
        for (let step = 1; step < items.length; step++) {
            let nextIndex = startIndex + step * indexDelta;
            if (nextIndex < 0) { nextIndex += items.length; }
            if (nextIndex >= items.length) { nextIndex -= items.length; }
            if (this.canBeSelected(items[nextIndex])) {
                return nextIndex;
            }
        }
        return startIndex;
    }

    private canBeSelected(model: ElementModel) {
        const alreadyOnDiagram = this.props.view.model.elements.findIndex(
            element => element.iri === model.id && element.group === undefined
        ) >= 0;
        return !this.props.useDragAndDrop || !alreadyOnDiagram;
    }

    private focusOn(index: number) {
        const scrollableContainer = this.root.parentElement;

        const containerBounds = scrollableContainer.getBoundingClientRect();

        const item = this.root.children.item(index) as HTMLElement;
        const itemBounds = item.getBoundingClientRect();
        const itemTop = itemBounds.top - containerBounds.top;
        const itemBottom = itemBounds.bottom - containerBounds.top;

        if (itemTop < 0) {
            scrollableContainer.scrollTop += itemTop;
        } else if (itemBottom > containerBounds.height) {
            scrollableContainer.scrollTop += (itemBottom - containerBounds.height);
        }

        item.focus();
    }
}
