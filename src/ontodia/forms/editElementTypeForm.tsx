import * as React from 'react';

import { EditorController } from '../editor/editorController';
import { DiagramView } from '../diagram/view';
import { ElementModel, LinkModel, sameElement, sameLink } from '../data/model';
import { MetadataApi } from '../data/metadataApi';

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
            elementValue: {value: props.target},
            linkValue: {value: props.link},
            isValid: true,
        };
    }

    componentDidMount() {
        this.validate();
    }

    componentDidUpdate(prevProps: Props, prevState: State) {
        const {elementValue, linkValue} = this.state;
        if (!sameElement(elementValue.value, prevState.elementValue.value)) {
            this.resetLinkValue();
            this.validate();
        }
        if (!sameLink(linkValue.value, prevState.linkValue.value)) {
            this.validate();
        }
    }

    componentWillUnmount() {
        this.validationCancellation.abort();
    }

    private resetLinkValue() {
        const {link} = this.props;
        this.setState(({elementValue: {value: element}}) =>
            ({linkValue: {value: {...link, targetId: element.id}, error: undefined}})
        );
    }

    private validate() {
        const {editor, link: originalLink} = this.props;
        const {elementValue: {value: element}, linkValue: {value: link}} = this.state;
        this.setState({isValidating: true});

        this.validationCancellation.abort();
        this.validationCancellation = new Cancellation();
        const signal = this.validationCancellation.signal;

        const validateElement = validateElementType(element);
        const validateLink = validateLinkType(editor, link, originalLink);
        Promise.all([validateElement, validateLink]).then(([elementError, linkError]) => {
            if (signal.aborted) { return; }
            this.setState(({elementValue, linkValue}) => ({
                elementValue: {...elementValue, error: elementError},
                linkValue: {...linkValue, error: linkError},
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
                        onChange={value => this.setState({elementValue: {value, error: undefined}})} />
                    <LinkTypeSelector editor={editor}
                        view={view}
                        metadataApi={metadataApi}
                        linkValue={linkValue}
                        source={source}
                        target={elementValue.value}
                        onChange={value => this.setState({linkValue: {value, error: undefined}})}
                        disabled={elementValue.error !== undefined} />
                    {isValidating ? (
                        <div className={`${CLASS_NAME}__progress`}>
                            <ProgressBar state={ProgressState.loading} height={10} />
                        </div>
                    ) : null}
                </div>
                <div className={`${CLASS_NAME}__controls`}>
                    <button className={`ontodia-btn ontodia-btn-success ${CLASS_NAME}__apply-button`}
                        onClick={() => this.props.onApply(elementValue.value, linkValue.value)}
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
