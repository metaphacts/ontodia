import * as React from 'react';

import { EditorController } from '../editor/editorController';
import { DiagramView } from '../diagram/view';
import { ElementModel, LinkModel } from '../data/model';
import { MetadataApi } from '../data/metadataApi';
import { LinkDirection } from '../diagram/elements';

import { Cancellation } from '../viewUtils/async';
import { HtmlSpinner } from '../viewUtils/spinner';

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
    target: {
        value: ElementModel;
        isNew: boolean;
    };
    onChangeElement: (value: ElementModel) => void;
    onChangeLink: (value: LinkModel) => void;
    onApply: (elementData: ElementModel, isNewElement: boolean, linkData: LinkModel) => void;
    onCancel: () => void;
}

export interface State {
    elementValue?: ElementValue;
    linkValue?: LinkValue;
    isValidating?: boolean;
}

export class EditElementTypeForm extends React.Component<Props, State> {
    private validationCancellation = new Cancellation();

    constructor(props: Props) {
        super(props);
        const {target, link} = this.props;
        this.state = {
            elementValue: {
                value: target.value,
                isNew: target.isNew,
                loading: false,
                validated: true,
                allowChange: true,
            },
            linkValue: {
                value: {link, direction: LinkDirection.out},
                validated: true,
                allowChange: true,
            },
        };
    }

    componentDidMount() {
        this.validate();
    }

    componentWillUnmount() {
        this.validationCancellation.abort();
    }

    private setElementOrLink({elementValue, linkValue}: {
        elementValue?: ElementValue;
        linkValue?: LinkValue;
    }) {
        this.setState(state => ({
            elementValue: elementValue || state.elementValue,
            linkValue: linkValue || state.linkValue,
        }),
        () => {
            if ((elementValue && !elementValue.validated) || (linkValue && !linkValue.validated)) {
                this.validate();
            }
            if (elementValue && elementValue.validated && elementValue.allowChange) {
                this.props.onChangeElement(elementValue.value);
            }
            if (linkValue && linkValue.validated && linkValue.allowChange) {
                this.props.onChangeLink(linkValue.value.link);
            }
        });
    }

    private validate() {
        const {editor, link: originalLink} = this.props;
        const {elementValue, linkValue} = this.state;
        this.setState({isValidating: true});

        this.validationCancellation.abort();
        this.validationCancellation = new Cancellation();
        const signal = this.validationCancellation.signal;

        const validateElement = validateElementType(elementValue.value);
        const validateLink = validateLinkType(editor, linkValue.value.link, originalLink);
        Promise.all([validateElement, validateLink]).then(([elementError, linkError]) => {
            if (signal.aborted) { return; }
            this.setState({isValidating: false});
            this.setElementOrLink({
                elementValue: {...elementValue, ...elementError, validated: true},
                linkValue: {...linkValue, ...linkError, validated: true},
            });
        });
    }

    render() {
        const {editor, view, metadataApi, source, link: originalLink} = this.props;
        const {elementValue, linkValue, isValidating} = this.state;
        const isValid = !elementValue.error && !linkValue.error;
        return (
            <div className={CLASS_NAME}>
                <div className={`${CLASS_NAME}__body`}>
                    <ElementTypeSelector editor={editor}
                        view={view}
                        metadataApi={metadataApi}
                        source={source}
                        elementValue={elementValue}
                        onChange={newState => {
                            this.setElementOrLink({
                                elementValue: {
                                    value: newState.value,
                                    isNew: newState.isNew,
                                    loading: newState.loading,
                                    error: undefined,
                                    validated: false,
                                    allowChange: false,
                                },
                                linkValue: {
                                    value: {
                                        link: {...originalLink, targetId: newState.value.id},
                                        direction: LinkDirection.out,
                                    },
                                    validated: false,
                                    allowChange: false,
                                },
                            });
                        }} />
                    {elementValue.loading ? (
                        <div style={{display: 'flex'}}>
                            <HtmlSpinner width={20} height={20} />&nbsp;Loading entity...
                        </div>
                    ) : (
                        <LinkTypeSelector editor={editor}
                            view={view}
                            metadataApi={metadataApi}
                            linkValue={linkValue}
                            source={source}
                            target={elementValue.value}
                            onChange={value => this.setElementOrLink({
                                linkValue: {value, error: undefined, validated: false, allowChange: false},
                            })}
                            disabled={elementValue.error !== undefined}
                        />
                    )}
                    {isValidating ? (
                        <div className={`${CLASS_NAME}__progress`}>
                            <ProgressBar state={ProgressState.loading} height={10} />
                        </div>
                    ) : null}
                </div>
                <div className={`${CLASS_NAME}__controls`}>
                    <button className={`ontodia-btn ontodia-btn-success ${CLASS_NAME}__apply-button`}
                        onClick={() => this.props.onApply(
                            elementValue.value,
                            elementValue.isNew,
                            linkValue.value.link
                        )}
                        disabled={elementValue.loading || !isValid || isValidating}>
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
