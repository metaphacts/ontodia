import * as React from 'react';

import { EditorController } from '../editor/editorController';
import { DiagramView } from '../diagram/view';
import { ElementModel, LinkModel, sameElement, sameLink } from '../data/model';
import { MetadataApi } from '../data/metadataApi';

import { Cancellation } from '../viewUtils/async';

import { ElementTypeSelector, ElementValue, validateElementType } from './elementTypeSelector';
import { LinkTypeSelector, LinkValue, validateLinkType } from './linkTypeSelector';

const CLASS_NAME = 'ontodia-edit-form';

export interface Props {
    editor: EditorController;
    view: DiagramView;
    metadataApi?: MetadataApi;
    link: LinkModel;
    source: ElementModel;
    target: ElementModel;
    onApply: (elementData: ElementModel, linkData: LinkModel) => void;
    onCancel: () => void;
}

export interface State {
    elementValue?: ElementValue;
    linkValue?: LinkValue;
    isValid?: boolean;
}

export class EditElementTypeForm extends React.Component<Props, State> {
    private readonly cancellation = new Cancellation();

    constructor(props: Props) {
        super(props);
        this.state = {
            elementValue: {value: props.target},
            linkValue: {value: props.link},
        };
    }

    componentDidMount() {
        this.validateElement();
        this.validateLink();
    }

    componentDidUpdate(prevProps: Props, prevState: State) {
        const {elementValue, linkValue} = this.state;
        if (!sameElement(elementValue.value, prevState.elementValue.value)) {
            this.resetLinkValue();
            this.validateElement();
        }
        if (!sameLink(linkValue.value, prevState.linkValue.value)) {
            this.validateLink();
        }
        if (elementValue.error !== prevState.elementValue.error || linkValue.error !== prevState.linkValue.error) {
            this.validate();
        }
    }

    componentWillUnmount() {
        this.cancellation.abort();
    }

    private resetLinkValue() {
        const {link} = this.props;
        this.setState(({elementValue: {value: element}}) => ({linkValue: {value: {...link, targetId: element.id}}}));
    }

    private validateElement() {
        const {elementValue: {value: element}} = this.state;
        validateElementType(element).then(error => {
            if (this.cancellation.signal.aborted) { return; }
            this.setState(({elementValue}) => ({elementValue: {...elementValue, error}}));
        });
    }

    private validateLink() {
        const {editor} = this.props;
        const {linkValue: {value: link}} = this.state;
        validateLinkType(editor, link).then(error => {
            if (this.cancellation.signal.aborted) { return; }
            this.setState(({linkValue}) => ({linkValue: {...linkValue, error}}));
        });
    }

    private validate() {
        this.setState(({elementValue, linkValue}) => ({isValid: !elementValue.error && !linkValue.error}));
    }

    render() {
        const {editor, view, metadataApi, source} = this.props;
        const {elementValue, linkValue, isValid} = this.state;
        return (
            <div className={CLASS_NAME}>
                <div className={`${CLASS_NAME}__body`}>
                    <ElementTypeSelector editor={editor}
                        view={view}
                        metadataApi={metadataApi}
                        source={source}
                        elementValue={elementValue}
                        onChange={data => this.setState({elementValue: data})} />
                    <div className={`${CLASS_NAME}__form-row`}>
                        <LinkTypeSelector editor={editor}
                            view={view}
                            metadataApi={metadataApi}
                            linkValue={linkValue}
                            source={source}
                            target={elementValue.value}
                            onChange={data => this.setState({linkValue: data})}
                            disabled={elementValue.error !== undefined} />
                    </div>
                </div>
                <div className={`${CLASS_NAME}__controls`}>
                    <button className={`ontodia-btn ontodia-btn-success ${CLASS_NAME}__apply-button`}
                        onClick={() => this.props.onApply(elementValue.value, linkValue.value)}
                        disabled={!isValid}>
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
