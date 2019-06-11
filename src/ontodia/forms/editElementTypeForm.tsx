import * as React from 'react';

import { EditorController } from '../editor/editorController';
import { DiagramView } from '../diagram/view';
import { ElementModel, LinkModel, sameElement, sameLink } from '../data/model';
import { MetadataApi } from '../data/metadataApi';
import { LinkDirection } from '../diagram/elements';

import { Cancellation } from '../viewUtils/async';

import { ProgressBar, ProgressState } from '../widgets/progressBar';

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
    onChangeElement: (elementData: ElementModel) => void;
    onChangeLink: (linkData: LinkModel) => void;
    onApply: (elementData: ElementModel, linkData: LinkModel) => void;
    onCancel: () => void;
}

export interface State {
    elementValue?: ElementValue;
    linkValue?: LinkValue;
    isValid?: boolean;
    isValidating?: boolean;
}

export class EditElementTypeForm extends React.Component<Props, State> {
    private validationCancellation = new Cancellation();

    constructor(props: Props) {
        super(props);
        this.state = {
            elementValue: {value: props.target, validated: true},
            linkValue: {value: {link: props.link, direction: LinkDirection.out}, validated: true},
            isValid: true,
        };
    }

    componentDidMount() {
        this.validate();
    }

    componentDidUpdate(prevProps: Props, prevState: State) {
        const {elementValue, linkValue} = this.state;
        const elementChanged = !sameElement(elementValue.value, prevState.elementValue.value);
        const linkChanged = !sameLink(linkValue.value.link, prevState.linkValue.value.link);
        if (elementChanged || linkChanged) {
            if (elementChanged) { this.resetLinkValue(); }
            this.validate();
        }
        if (elementValue !== prevState.elementValue && elementValue.validated && !elementValue.error) {
            this.props.onChangeElement(elementValue.value);
        }
        if (linkValue !== prevState.linkValue && linkValue.validated && !linkValue.error) {
            this.props.onChangeLink(linkValue.value.link);
        }
    }

    componentWillUnmount() {
        this.validationCancellation.abort();
    }

    private resetLinkValue() {
        const {link: originalLink} = this.props;
        this.setState(({elementValue: {value: element}}): State => {
            const link: LinkModel = {...originalLink, targetId: element.id};
            return {linkValue: {value: {link, direction: LinkDirection.out}, error: undefined, validated: false}};
        });
    }

    private validate() {
        const {editor, link: originalLink} = this.props;
        const {elementValue: {value: element}, linkValue: {value}} = this.state;
        this.setState({isValidating: true});

        this.validationCancellation.abort();
        this.validationCancellation = new Cancellation();
        const signal = this.validationCancellation.signal;

        const validateElement = validateElementType(element);
        const validateLink = validateLinkType(editor, value.link, originalLink);
        Promise.all([validateElement, validateLink]).then(([elementError, linkError]) => {
            if (signal.aborted) { return; }
            this.setState(({elementValue, linkValue}) => ({
                elementValue: {...elementValue, error: elementError, validated: true},
                linkValue: {...linkValue, error: linkError, validated: true},
                isValid: !(elementError || linkError),
                isValidating: false,
            }));
        });
    }

    render() {
        const {editor, view, metadataApi, source} = this.props;
        const {elementValue, linkValue, isValid, isValidating} = this.state;
        return (
            <div className={CLASS_NAME}>
                <div className={`${CLASS_NAME}__body`}>
                    <ElementTypeSelector editor={editor}
                        view={view}
                        metadataApi={metadataApi}
                        source={source}
                        elementValue={elementValue}
                        onChange={value =>
                            this.setState({elementValue: {value, error: undefined, validated: false}})
                        } />
                    <LinkTypeSelector editor={editor}
                        view={view}
                        metadataApi={metadataApi}
                        linkValue={linkValue}
                        source={source}
                        target={elementValue.value}
                        onChange={value => this.setState({linkValue: {value, error: undefined, validated: false}})}
                        disabled={elementValue.error !== undefined} />
                    {isValidating ? (
                        <div className={`${CLASS_NAME}__progress`}>
                            <ProgressBar state={ProgressState.loading} height={10} />
                        </div>
                    ) : null}
                </div>
                <div className={`${CLASS_NAME}__controls`}>
                    <button className={`ontodia-btn ontodia-btn-success ${CLASS_NAME}__apply-button`}
                        onClick={() => this.props.onApply(elementValue.value, linkValue.value.link)}
                        disabled={!isValid || isValidating}>
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
