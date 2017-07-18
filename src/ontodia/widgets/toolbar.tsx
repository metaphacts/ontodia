import * as React from 'react';

import { WorkspaceLanguage } from '../workspace/workspace';

export interface Props {
    onSaveDiagram?: () => void;
    onSaveToSelf?: () => void;
    onEditAtMainSite?: () => void;
    onResetDiagram?: () => void;
    onForceLayout: () => void;
    onZoomIn: () => void;
    onZoomOut: () => void;
    onZoomToFit: () => void;
    onUndo: () => void;
    onRedo: () => void;
    onExportSVG: (link: HTMLAnchorElement) => void;
    onExportPNG: (link: HTMLAnchorElement) => void;
    onPrint: () => void;
    onShare?: () => void;
    languages: ReadonlyArray<WorkspaceLanguage>;
    selectedLanguage: string;
    onChangeLanguage: (language: string) => void;
    onShowTutorial: () => void;
    isEmbeddedMode?: boolean;
    isDiagramSaved?: boolean;
}

export interface State {
    showModal: boolean;
}

const CLASS_NAME = 'ontodia-toolbar';

export class EditorToolbar extends React.Component<Props, State> {
    private downloadImageLink: HTMLAnchorElement;

    constructor(props: Props) {
        super(props);
        this.state = {showModal: false};
    }

    private onChangeLanguage = (event: React.SyntheticEvent<HTMLSelectElement>) => {
        const value = event.currentTarget.value;
        this.props.onChangeLanguage(value);
    }

    private onExportSVG = () => {
        this.props.onExportSVG(this.downloadImageLink);
    }

    private onExportPNG = () => {
        this.props.onExportPNG(this.downloadImageLink);
    }

    render() {
        const intro = '<h4>Toolbox</h4>' +
            '<p>You can use additional tools for working with your diagram, such as choosing between automatic ' +
            'layouts or fit diagram to screen, etc.</p>' +
            '<p>Don’t forget to save diagrams, it always comes handy after all.</p>';

        const btnSaveDiagram = (
            <button type='button' className='saveDiagramButton btn btn-primary'
                    onClick={this.props.onSaveDiagram}>
                <span className='fa fa-floppy-o' aria-hidden='true' /> Save diagram
            </button>
        );

        const btnEditAtMainSite = (
            <button type='button' className='btn btn-primary' onClick={this.props.onEditAtMainSite}>
                Edit in <img src='images/ontodia_headlogo.png' height='15.59'/>
            </button>
        );

        const btnShare = (
            <button type='button' className='btn btn-default'
                    title='Publish or share diagram' onClick={this.props.onShare}>
                <span className='fa fa-users' aria-hidden='true' /> Share
            </button>
        );

        const btnHelp = (
            <button type='button' className='btn btn-default'
                    onClick={this.props.onShowTutorial}>
                <span className='fa fa-info-circle' aria-hidden='true' /> Help
            </button>
        );

        const nonEmbedded = !this.props.isEmbeddedMode;
        const {selectedLanguage, languages} = this.props;
        return (
            <div className={CLASS_NAME}>
                <div className='btn-group btn-group-sm'
                     data-position='bottom' data-step='6' data-intro={intro}>
                    {nonEmbedded
                        ? (this.props.onSaveDiagram ? btnSaveDiagram : undefined)
                        : (this.props.onEditAtMainSite ? btnEditAtMainSite : undefined)}
                    {this.props.onSaveToSelf ? (
                        <button type='button' className='btn btn-default'>
                            <span className='fa fa-floppy-o' aria-hidden='true'></span> Save under your account
                        </button>
                    ) : undefined}
                    {(this.props.isDiagramSaved && this.props.onResetDiagram) ? (
                        <button type='button' className='btn btn-default'>
                            <span className='fa fa-trash-o' aria-hidden='true'></span> Reset
                        </button>
                    ) : undefined}
                    <button type='button' className='btn btn-default'
                            onClick={this.props.onForceLayout}>
                        <span className='fa fa-sitemap' aria-hidden='true' /> Layout
                    </button>
                    <button type='button' className='btn btn-default'
                            title='Zoom In' onClick={this.props.onZoomIn}>
                        <span className='fa fa-search-plus' aria-hidden='true' />
                    </button>
                    <button type='button' className='btn btn-default'
                            title='Zoom Out' onClick={this.props.onZoomOut}>
                        <span className='fa fa-search-minus' aria-hidden='true' />
                    </button>
                    <button type='button' className='btn btn-default'
                            title='Fit to Screen' onClick={this.props.onZoomToFit}>
                        <span className='fa fa-arrows-alt' aria-hidden='true' />
                    </button>
                    {(nonEmbedded && this.props.onUndo) ? (
                        <button type='button' className={`btn btn-default ${CLASS_NAME}__undo`}
                            title='Undo' onClick={this.props.onUndo}>
                            <span className='fa fa-undo' aria-hidden='true' />
                        </button>
                    ) : undefined}
                    {(nonEmbedded && this.props.onRedo) ? (
                        <button type='button' className={`btn btn-default ${CLASS_NAME}__redo`}
                            title='Redo' onClick={this.props.onRedo}>
                            <span className='fa fa-repeat' aria-hidden='true' />
                        </button>
                    ) : undefined}
                    <button type='button' className='btn btn-default'
                            title='Export diagram as PNG' onClick={this.onExportPNG}>
                        <span className='fa fa-picture-o' aria-hidden='true' /> PNG
                    </button>
                    <button type='button' className='btn btn-default'
                            title='Export diagram as SVG' onClick={this.onExportSVG}>
                        <span className='fa fa-picture-o' aria-hidden='true' /> SVG
                    </button>
                    <button type='button' className='btn btn-default'
                            title='Print diagram' onClick={this.props.onPrint}>
                        <span className='fa fa-print' aria-hidden='true' />
                    </button>
                    {(nonEmbedded && this.props.onShare) ? btnShare : undefined}
                    {(languages.length > 1) ? (
                        <span className={`btn-group ${CLASS_NAME}__language-selector`}>
                            {nonEmbedded ? <label><span>Data Language:</span></label> : undefined}
                            <select value={selectedLanguage} onChange={this.onChangeLanguage}>
                                {languages.map(({code, label}) =>
                                    <option key={code} value={code}>{label}</option>)}
                            </select>
                        </span>
                    ) : null}
                    {nonEmbedded ? btnHelp : undefined}
                </div>
                <a href='#' ref={link => { this.downloadImageLink = link; }}
                   style={{display: 'none', visibility: 'collapse'}}/>
            </div>
        );
    }
}

export default EditorToolbar;
