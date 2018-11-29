import * as React from 'react';

import { PLACEHOLDER_ELEMENT_TYPE } from '../data/schema';
import { ElementModel, ElementTypeIri } from '../data/model';

import { EditorController } from '../editor/editorController';
import { DiagramView } from '../diagram/view';
import { MetadataApi } from '../data/metadataApi';

import { createRequest } from '../widgets/instancesSearch';
import { ListElementView } from '../widgets/listElementView';

import { Cancellation } from '../viewUtils/async';
import { HtmlSpinner } from '../viewUtils/spinner';

const CLASS_NAME = 'ontodia-edit-form';

export interface ElementValue {
    value: ElementModel;
    error?: string;
}

export interface Props {
    editor: EditorController;
    view: DiagramView;
    metadataApi: MetadataApi | undefined;
    source: ElementModel;
    elementValue: ElementValue;
    onChange: (data: ElementValue) => void;
}

export interface State {
    elementTypes?: ReadonlyArray<ElementTypeIri>;
    searchString?: string;
    isLoading?: boolean;
    existingElements?: ReadonlyArray<ElementModel>;
}

export class ElementTypeSelector extends React.Component<Props, State> {
    private readonly cancellation = new Cancellation();

    constructor(props: Props) {
        super(props);
        this.state = {searchString: '', existingElements: []};
    }

    componentDidMount() {
        this.fetchPossibleElementTypes();
    }

    componentDidUpdate(prevProps: Props, prevState: State) {
        const {elementValue, onChange} = this.props;
        const {searchString} = this.state;
        if (searchString !== prevState.searchString) {
            onChange({...elementValue, value: {...elementValue.value, types: [PLACEHOLDER_ELEMENT_TYPE]}});
            this.searchExistingElements();
        }
    }

    componentWillUnmount() {
        this.cancellation.abort();
    }

    private fetchPossibleElementTypes() {
        const {metadataApi, source} = this.props;
        if (!metadataApi) { return; }
        metadataApi.typesOfElementsDraggedFrom(source, this.cancellation.signal).then(elementTypes => {
            this.setState({elementTypes});
        });
    }

    private searchExistingElements() {
        const {editor, view} = this.props;
        const {searchString} = this.state;
        this.setState({existingElements: []});
        if (searchString.length > 0) {
            this.setState({isLoading: true});
            const request = createRequest({text: searchString}, view.getLanguage());
            editor.model.dataProvider.filter(request).then(elements => {
                const existingElements = Object.keys(elements).map(key => elements[key]);
                this.setState({existingElements, isLoading: false});
            });
        }
    }

    private onElementTypeChange = (e: React.FormEvent<HTMLSelectElement>) => {
        const {elementValue, onChange} = this.props;
        const type = (e.target as HTMLSelectElement).value as ElementTypeIri;
        const value = {...elementValue.value, types: [type]};
        onChange({...elementValue, value});
    }

    private renderPossibleElementType = (elementType: ElementTypeIri) => {
        const {view} = this.props;
        const type = view.model.createClass(elementType);
        const label = view.getElementTypeLabel(type).text;
        return <option key={elementType} value={elementType}>{label}</option>;
    }

    private renderElementTypeSelector() {
        const {elementValue} = this.props;
        const {elementTypes} = this.state;
        const value = elementValue.value.types.length ? elementValue.value.types[0] : '';
        return (
            <div>
                <label>Entity Type</label>
                {
                    elementTypes ? (
                        <select className='ontodia-form-control' value={value} onChange={this.onElementTypeChange}>
                            <option value={PLACEHOLDER_ELEMENT_TYPE} disabled={true}>Select entity type</option>
                            {
                                elementTypes.map(this.renderPossibleElementType)
                            }
                        </select>
                    ) : <div><HtmlSpinner width={20} height={20} /></div>
                }
            </div>
        );
    }

    private renderExistingElementsList() {
        const {view, elementValue, onChange} = this.props;
        const {elementTypes, isLoading, existingElements} = this.state;
        if (isLoading) {
            return <HtmlSpinner width={20} height={20} />;
        }
        if (existingElements.length > 0) {
            return existingElements.map(element => {
                const isAlreadyOnDiagram = Boolean(
                    view.model.elements.find(({iri, group}) => iri === element.id && group === undefined)
                );
                const hasAppropriateType = Boolean(elementTypes.find(type => element.types.indexOf(type) >= 0));
                return (
                    <ListElementView key={element.id}
                        view={view}
                        model={element}
                        disabled={isAlreadyOnDiagram || !hasAppropriateType}
                        selected={element.id === elementValue.value.id}
                        onClick={(e, model) => onChange({...elementValue, value: model})} />
                );
            });
        }
        return <span>No results</span>;
    }

    render() {
        const {searchString} = this.state;
        return (
            <div className={`${CLASS_NAME}__form-row ${CLASS_NAME}__element-selector`}>
                <div className={`${CLASS_NAME}__search`}>
                    <i className={`fa fa-search ${CLASS_NAME}__search-icon`} />
                    <input value={searchString}
                        onChange={e => this.setState({searchString: (e.target as HTMLInputElement).value})}
                        className={`ontodia-form-control ${CLASS_NAME}__search-input`}
                        placeholder='Search for...'
                        autoFocus />
                </div>
                {
                    searchString.length > 0 ? (
                        <div className={`${CLASS_NAME}__existing-elements-list`}>
                            {this.renderExistingElementsList()}
                        </div>
                    ) : (
                        <div>
                            <div className={`${CLASS_NAME}__separator`}>
                                <i className={`${CLASS_NAME}__separator-text`}>or create new entity</i>
                            </div>
                            {this.renderElementTypeSelector()}
                        </div>
                    )
                }
            </div>
        );
    }
}

export function validateElementType(element: ElementModel): Promise<string | undefined> {
    const isElementTypeSelected = element.types.indexOf(PLACEHOLDER_ELEMENT_TYPE) < 0;
    const error = !isElementTypeSelected ? 'Required!' : undefined;
    return Promise.resolve(error);
}
