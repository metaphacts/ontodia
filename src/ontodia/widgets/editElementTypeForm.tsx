import * as React from 'react';

import { DiagramView } from '../diagram/view';
import { ElementModel, ElementTypeIri, LinkModel } from '../data/model';
import { MetadataApi } from '../data/metadataApi';
import { Cancellation } from '../viewUtils/async';
import { SelectLinkType } from './selectLinkType';

const CLASS_NAME = 'ontodia-edit-form';

export interface Props {
    view: DiagramView;
    metadataApi?: MetadataApi;
    link: LinkModel;
    source: ElementModel;
    target: ElementModel;
    onApply: (elementData: ElementModel, linkData: LinkModel) => void;
    onCancel: () => void;
}

export interface State {
    elementData?: ElementModel;
    linkData?: LinkModel;
    elementTypes?: ReadonlyArray<ElementTypeIri>;
}

export class EditElementTypeForm extends React.Component<Props, State> {
    private readonly cancellation = new Cancellation();

    constructor(props: Props) {
        super(props);
        this.state = {elementData: props.target, linkData: props.link, elementTypes: []};
    }

    componentDidMount() {
        const {metadataApi, source} = this.props;
        if (!metadataApi) { return; }
        metadataApi.typesOfElementsDraggedFrom(source, this.cancellation.signal).then(elementTypes => {
            this.setState({elementTypes});
        });
    }

    onElementTypeChange = (e: React.FormEvent<HTMLSelectElement>) => {
        const type = (e.target as HTMLSelectElement).value as ElementTypeIri;
        this.setState({elementData: {...this.state.elementData, types: [type]}});
    }

    private renderElementType() {
        const {view} = this.props;
        const {elementData} = this.state;
        const value = elementData.types.length ? elementData.types[0] : '';
        return (
            <label>
                Element type
                <select className='ontodia-form-control' value={value} onChange={this.onElementTypeChange}>
                    <option value='' disabled={true}>Select element type</option>
                    {
                        this.state.elementTypes.map(elementType => {
                            const type = view.model.createClass(elementType);
                            const label = view.getElementTypeLabel(type).text;
                            return <option key={elementType} value={elementType}>{label}</option>;
                        })
                    }
                </select>
            </label>
        );
    }

    render() {
        const {view, metadataApi, source} = this.props;
        const {elementData, linkData} = this.state;
        return (
            <div className={CLASS_NAME}>
                <div className={`${CLASS_NAME}__body`}>
                    <div className={`${CLASS_NAME}__form-row`}>
                        {this.renderElementType()}
                    </div>
                    <div className={`${CLASS_NAME}__form-row`}>
                        <SelectLinkType view={view} metadataApi={metadataApi} link={linkData} source={source}
                            target={elementData} onChange={data => this.setState({linkData: data})} />
                    </div>
                </div>
                <div className={`${CLASS_NAME}__controls`}>
                    <button className={`ontodia-btn ontodia-btn-success ${CLASS_NAME}__apply-button`}
                        onClick={() => this.props.onApply(elementData, linkData)}>
                        Apply
                    </button>
                    <button className='ontodia-btn ontodia-btn-danger'
                        onClick={this.props.onCancel}>
                        Cancel
                    </button>
                </div>
            </div>
        );
    }
}
