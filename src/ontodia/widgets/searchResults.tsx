import * as React from 'react';

import { Dictionary, ElementModel } from '../data/model';
import { DiagramView } from '../diagram/view';
import { isEmptyMap } from '../viewUtils/collections';
import { EventObserver } from '../viewUtils/events';
import { ListElementView, startDragElements, listElementViewId } from './listElementView';

const CLASS_NAME = 'ontodia-search-results';

export interface SearchResultProps {
    readonly items?: ReadonlyArray<ElementModel>;
    selection?: Readonly<Dictionary<true>>;
    view: DiagramView;
    searchKey?: string;
    insteadOfUpdateSelection?: (newSelection: Readonly<Dictionary<true>>) => void;
}

export interface SearchResultsState {
    readonly selection?: Readonly<Dictionary<true>>;
}

export class SearchResults extends React.Component<SearchResultProps, SearchResultsState> {
    private readonly listener = new EventObserver();
    private focusIndex: number = 0;
    private selectionIndex: number = 0;
    private rootHtml: HTMLElement;

    constructor(props: SearchResultProps) {
        super(props);
        this.state = {
            selection: props.selection || {},
        };
    }

    render(): React.ReactElement<any> {
        const items = this.props.items || [];
        return <ul
            ref={div => this.rootHtml = div}
            tabIndex={-1}
            className={CLASS_NAME}
            onFocus={() => this.subscribeOnKeyboard()}
            onBlur={() => this.unsubscribeFromKeyboard()}>
            {items.map(model => this.renderResultItem(model))}
        </ul>;
    }

    renderResultItem(model: ElementModel) {
        const alreadyOnDiagram = this.isOnDiagram(model);

        return (
            <ListElementView
                key={model.id}
                model={model}
                view={this.props.view}
                highlightText={this.props.searchKey}
                disabled={alreadyOnDiagram}
                selected={this.state.selection[model.id] || false}
                onClick={alreadyOnDiagram ? undefined : this.onSelectedChanged}
                onDragStart={e => {
                    const iris = Object.keys({...this.state.selection, [model.id]: true});
                    return startDragElements(e, iris);
                }}
            />
        );
    }

    componentDidMount() {
        this.listener.listen(this.props.view.model.events, 'changeCells', () => {
            const {selection: currentSelection} = this.state;
            const {items} = this.props;

            if (isEmptyMap(currentSelection)) {
                if (items && items.length > 0) {
                    // redraw "already on diagram" state
                    this.forceUpdate();
                }
            } else {
                const selection: Dictionary<true> = {...currentSelection};
                for (const element of this.props.view.model.elements) {
                    if (element.group === undefined && selection[element.iri]) {
                        delete selection[element.iri];
                    }
                }
                this.updateSelection(selection);
            }
        });
    }

    componentWillReceiveProps(props: SearchResultProps) {
        this.setState({selection: props.selection || {}});
    }

    componentWillUnmount() {
        this.unsubscribeFromKeyboard();
        this.listener.stopListening();
    }

    private updateSelection(selection: Dictionary<true>) {
        if (this.props.insteadOfUpdateSelection) {
            this.props.insteadOfUpdateSelection(selection);
        } else {
            this.setState({selection});
        }
    }

    private subscribeOnKeyboard() {
        document.addEventListener('keydown', this.onKeyUp);
    }

    private unsubscribeFromKeyboard() {
        document.removeEventListener('keydown', this.onKeyUp);
    }

    private onKeyUp = (event: KeyboardEvent) => {
        const {items} = this.props;
        const isPressedUp = event.keyCode === 38 || event.which === 38;
        const isPressDown = event.keyCode === 40 || event.which === 40;

        if (isPressedUp || isPressDown) {
            if (event.shiftKey) { // select range
                if (isPressedUp) {
                    this.selectionIndex = this.getNextIndex(this.selectionIndex, 'up');
                } else if (isPressDown) {
                    this.selectionIndex = this.getNextIndex(this.selectionIndex, 'down');
                }
                const startIndex = Math.min(this.focusIndex, this.selectionIndex);
                const finishIndex = Math.max(this.focusIndex, this.selectionIndex);
                const selection = this.getSelectedRange(startIndex, finishIndex);

                this.updateSelection(selection);
                this.focusOn(items[this.selectionIndex]);
            } else { // change focus
                const startIndex = Math.min(this.focusIndex, this.selectionIndex);
                const finishIndex = Math.max(this.focusIndex, this.selectionIndex);

                if (isPressedUp) {
                    this.focusIndex = this.getNextIndex(startIndex, 'up');
                } else if (isPressDown) {
                    this.focusIndex = this.getNextIndex(finishIndex, 'down');
                }
                this.selectionIndex = this.focusIndex;

                const focusElement = items[this.focusIndex];
                this.updateSelection({[focusElement.id]: true});
                this.focusOn(focusElement);
            }
        }
        event.preventDefault();
    }

    private onSelectedChanged = (event: React.MouseEvent<any>, model: ElementModel) => {
        const getNewSelection = (state: SearchResultsState): Dictionary<true> => {
            let selection: Dictionary<true> = {...state.selection};
            const previouslySelected = Boolean(selection[model.id]);
            const items = this.props.items || [];
            const modelIndex = items.indexOf(model);

            if (event.shiftKey && this.focusIndex !== -1) { // select range
                const startIndex = Math.min(this.focusIndex, modelIndex);
                const finishIndex = Math.max(this.focusIndex, modelIndex);
                selection = this.getSelectedRange(startIndex, finishIndex);
            } else {
                this.selectionIndex = this.focusIndex = modelIndex;
                const ctrlKey = event.ctrlKey || event.metaKey;

                if (ctrlKey) { // select/deselect
                    event.preventDefault();
                    if (previouslySelected && selection[model.id]) {
                        delete selection[model.id];
                    } else if (!previouslySelected && !selection[model.id]) {
                        selection[model.id] = true;
                    }
                } else { // single click
                    selection = {[model.id]: true};
                }
            }
            return selection;
        };

        if (this.props.insteadOfUpdateSelection) {
            this.props.insteadOfUpdateSelection(getNewSelection(this.state));
        } else {
            this.setState((state): SearchResultsState => {
                return { selection: getNewSelection(state) };
            });
        }
    }

    private getSelectedRange(startIndex: number, finishIndex: number): Dictionary<true> {
        const items = this.props.items || [];
        const selection: Dictionary<true> = {};

        for (let i = startIndex; i <= finishIndex; i++) {
            const selectedModel = items[i];
            if (!this.isOnDiagram(selectedModel)) {
                selection[selectedModel.id] = true;
            }
        }
        return selection;
    }

    private getNextIndex(curIndex: number, direction: 'up' | 'down') {
        const items = this.props.items;
        const step = direction === 'up' ? -1 : 1;
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

    private focusOn(element: ElementModel) {
        // const elementId = listElementViewId(element);
        // const elementView = this.rootHtml.querySelector(`#${elementId}`);
        // elementView.scrollIntoView({behavior: 'smooth'});

        const container = this.rootHtml.parentElement;
        const elementId = listElementViewId(element);
        const elementView: HTMLElement = this.rootHtml.querySelector(`#${elementId}`);

        const rootOffset = container.clientTop + container.offsetTop;
        const minPosition = container.scrollTop + rootOffset;
        const elementTopOffset = elementView.offsetTop;
        if (elementTopOffset < minPosition) {
            container.scrollTop = elementTopOffset - rootOffset;
        }

        const maxPosition = minPosition + container.clientHeight;
        const elementBottomOffset = elementView.offsetTop + elementView.clientHeight;
        if (elementBottomOffset > maxPosition) {
            container.scrollTop = elementBottomOffset - container.clientHeight - rootOffset;
        }
    }
}
