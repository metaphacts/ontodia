import * as React from 'react';

import { PLACEHOLDER_ELEMENT_TYPE, PLACEHOLDER_LINK_TYPE } from '../data/schema';

import { DiagramView } from '../diagram/view';
import { ElementModel, ElementTypeIri, LinkModel } from '../data/model';
import { MetadataApi } from '../data/metadataApi';
import { Cancellation } from '../viewUtils/async';
import { HtmlSpinner } from '../viewUtils/spinner';
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
        this.state = {elementData: props.target, linkData: props.link};
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
        this.setState(({elementData, linkData}) => ({
            elementData: {...elementData, types: [type]},
            linkData: {...linkData, linkTypeId: PLACEHOLDER_LINK_TYPE},
        }));
    }

    private renderPossibleElementType = (elementType: ElementTypeIri) => {
        const {view} = this.props;
        const type = view.model.createClass(elementType);
        const label = view.getElementTypeLabel(type).text;
        return <option key={elementType} value={elementType}>{label}</option>;
    }

    private renderElementType() {
        const {elementData, elementTypes} = this.state;
        const value = elementData.types.length ? elementData.types[0] : '';
        return (
            <label>
                Element type
                {
                    elementTypes ? (
                        <select className='ontodia-form-control' value={value} onChange={this.onElementTypeChange}>
                            <option value={PLACEHOLDER_ELEMENT_TYPE} disabled={true}>Select element type</option>
                            {
                                elementTypes.map(this.renderPossibleElementType)
                            }
                        </select>
                    ) : <div><HtmlSpinner width={20} height={20} /></div>
                }
            </label>
        );
    }

    render() {
        const {view, metadataApi, source} = this.props;
        const {elementData, linkData} = this.state;
        const isElementTypeSelected = elementData.types.indexOf(PLACEHOLDER_ELEMENT_TYPE) < 0;
        const isLinkTypeSelected = linkData.linkTypeId !== PLACEHOLDER_LINK_TYPE;
        return (
            <div className={CLASS_NAME}>
                <div className={`${CLASS_NAME}__body`}>
                    <div className={`${CLASS_NAME}__form-row`}>
                        {this.renderElementType()}
                    </div>
                    <div className={`${CLASS_NAME}__form-row`}>
                        <SelectLinkType view={view} metadataApi={metadataApi} link={linkData} source={source}
                            target={elementData} onChange={data => this.setState({linkData: data})}
                            disabled={!isElementTypeSelected} />
                    </div>
                </div>
                <div className={`${CLASS_NAME}__controls`}>
                    <button className={`ontodia-btn ontodia-btn-success ${CLASS_NAME}__apply-button`}
                        onClick={() => this.props.onApply(elementData, linkData)}
                        disabled={!isElementTypeSelected || !isLinkTypeSelected}>
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
