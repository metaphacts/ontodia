import * as React from 'react';

import { ElementTypeIri } from '../data/model';
import { MetadataApi } from '../data/metadataApi';

import { FatClassModel } from '../diagram/elements';
import { formatLocalizedLabel } from '../diagram/model';
import { DiagramView } from '../diagram/view';

import { EditorController } from '../editor/editorController';

import { EventObserver } from '../viewUtils/events';
import { Cancellation } from '../viewUtils/async';
import { HtmlSpinner } from '../viewUtils/spinner';

export interface AuthoringToolsProps {
    editor: EditorController;
    metadataApi?: MetadataApi;
    view: DiagramView;
    selectedElementType: FatClassModel;
}

export interface State {
    canCreate?: boolean;
}

const CLASS_NAME = 'ontodia-authoring-tools';

const DEFAULT_ELEMENT_TYPE = 'http://www.w3.org/2002/07/owl#Thing' as ElementTypeIri;

export class AuthoringTools extends React.Component<AuthoringToolsProps, State> {
    private readonly listener = new EventObserver();
    private readonly cancellation = new Cancellation();

    constructor(props: AuthoringToolsProps, context: any) {
        super(props, context);
        this.state = {};
    }

    componentDidMount() {
        const {editor, selectedElementType} = this.props;
        this.listener.listen(editor.events, 'changeAuthoringState', () => {
            this.forceUpdate();
        });
        if (selectedElementType) {
            selectedElementType.events.on('changeLabel', this.onElementTypeLabelChanged);
            this.canCreate(this.props.selectedElementType);
        }
    }

    componentWillReceiveProps(nextProps: AuthoringToolsProps) {
        if (this.props.selectedElementType !== nextProps.selectedElementType) {
            if (this.props.selectedElementType) {
                this.props.selectedElementType.events.off('changeLabel', this.onElementTypeLabelChanged);
            }
            if (nextProps.selectedElementType) {
                nextProps.selectedElementType.events.on('changeLabel', this.onElementTypeLabelChanged);
            }
        }
    }

    componentDidUpdate(prevProp: AuthoringToolsProps) {
        if (this.props.selectedElementType && this.props.selectedElementType !== prevProp.selectedElementType) {
            this.canCreate(this.props.selectedElementType);
        }
    }

    componentWillUnmount() {
        const {selectedElementType} = this.props;
        if (selectedElementType) {
            selectedElementType.events.off('changeLabel', this.onElementTypeLabelChanged);
        }
        this.cancellation.abort();
    }

    private canCreate(selectedElementType: FatClassModel) {
        const {metadataApi} = this.props;
        if (!metadataApi) {
            this.setState({canCreate: false});
        } else {
            this.setState({canCreate: undefined});
            metadataApi.canCreateElement(selectedElementType.id, this.cancellation.signal).then(canCreate => {
                if (!this.cancellation.signal.aborted && this.props.selectedElementType.id === selectedElementType.id) {
                    this.setState({canCreate});
                }
            });
        }
    }

    private onElementTypeLabelChanged = () => {
        this.forceUpdate();
    }

    render() {
        return (
            <div className={CLASS_NAME}>
                {this.renderNewEntityButton()}
            </div>
        );
    }

    private renderNewEntityButton() {
        const {view, selectedElementType} = this.props;
        const {canCreate} = this.state;
        if (!selectedElementType) {
            return <div>Select a class to create new entity.</div>;
        }
        const typeLabel = formatLocalizedLabel(selectedElementType.id, selectedElementType.label, view.getLanguage());
        return (
            <button className={`ontodia-btn ontodia-btn-success ${CLASS_NAME}__create-entity`}
                onClick={this.onCreateNewEntity} disabled={!canCreate}>
                {
                    canCreate === undefined ? <HtmlSpinner width={20} height={20} /> : (
                        <span>+ Create new <span className={`${CLASS_NAME}__type-label`}>{typeLabel}</span></span>
                    )
                }
            </button>
        );
    }

    private onCreateNewEntity = () => {
        const {editor} = this.props;
        const element = editor.createNewEntity(this.props.selectedElementType.id);
        editor.setSelection([element]);
        editor.showEditEntityForm(element);
    }
}
