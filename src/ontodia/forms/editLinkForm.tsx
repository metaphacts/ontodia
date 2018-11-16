import * as React from 'react';

import { MetadataApi } from '../data/metadataApi';
import { ElementModel, LinkModel, sameLink } from '../data/model';

import { EditorController } from '../editor/editorController';
import { DiagramView } from '../diagram/view';

import { Cancellation } from '../viewUtils/async';

import { LinkTypeSelector, LinkValue, validateLinkType } from './linkTypeSelector';

const CLASS_NAME = 'ontodia-edit-form';

export interface Props {
    editor: EditorController;
    view: DiagramView;
    metadataApi: MetadataApi | undefined;
    link: LinkModel;
    source: ElementModel;
    target: ElementModel;
    onApply: (entity: LinkModel) => void;
    onCancel: () => void;
}

export interface State {
    linkValue?: LinkValue;
    isValid?: boolean;
}

export class EditLinkForm extends React.Component<Props, State> {
    private readonly cancellation = new Cancellation();

    constructor(props: Props) {
        super(props);
        this.state = {linkValue: {value: props.link}};
    }

    componentDidMount() {
        this.validate();
    }

    componentDidUpdate(prevProps: Props, prevState: State) {
        const {linkValue} = this.state;
        if (linkValue.error !== prevState.linkValue.error) {
            this.validate();
        }
        if (!sameLink(linkValue.value, prevState.linkValue.value)) {
            const isOriginalLink = sameLink(linkValue.value, this.props.link);
            isOriginalLink ? this.resetLinkValue() : this.validateLink();
        }
    }

    componentWillUnmount() {
        this.cancellation.abort();
    }

    private resetLinkValue() {
        this.setState(({linkValue}) => ({linkValue: {...linkValue, error: undefined}}));
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
        this.setState(({linkValue}) => ({isValid: !linkValue.error}));
    }

    render() {
        const {editor, view, metadataApi, link, source, target} = this.props;
        const {linkValue, isValid} = this.state;
        const isOriginalLink = sameLink(linkValue.value, link);
        return (
            <div className={CLASS_NAME}>
                <div className={`${CLASS_NAME}__body`}>
                    <div className={`${CLASS_NAME}__form-row`}>
                        <LinkTypeSelector editor={editor}
                            view={view}
                            metadataApi={metadataApi}
                            linkValue={linkValue}
                            source={source}
                            target={target}
                            onChange={data => this.setState({linkValue: data})}/>
                    </div>
                </div>
                <div className={`${CLASS_NAME}__controls`}>
                    <button className={`ontodia-btn ontodia-btn-success ${CLASS_NAME}__apply-button`}
                        onClick={() => this.props.onApply(linkValue.value)}
                        disabled={!isValid || isOriginalLink}>
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
