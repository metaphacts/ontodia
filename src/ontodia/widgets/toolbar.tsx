import * as React from 'react';

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
    onChangeLanguage: (language: string) => void;
    onShowTutorial: () => void;
    isEmbeddedMode?: boolean;
    isDiagramSaved?: boolean;
}

export interface State {
    showModal: boolean;
}

export class EditorToolbar extends React.Component<Props, State> {
    private downloadImageLink: HTMLAnchorElement;

    constructor(props: Props) {
        super(props);
        this.state = {showModal: false};
    }

    private onChangeLanguage = (event: React.SyntheticEvent) => {
        const value = (event.target as HTMLSelectElement).value;
        this.props.onChangeLanguage(value);
    };

    private onExportSVG = () => {
        this.props.onExportSVG(this.downloadImageLink);
    };

    private onExportPNG = () => {
        this.props.onExportPNG(this.downloadImageLink);
    };

    render() {
        const intro = '<h4>Toolbox</h4>' +
            '<p>You can use additional tools for working with your diagram, such as choosing between automatic ' +
            'layouts or fit diagram to screen, etc.</p>' +
            '<p>Don’t forget to save diagrams, it always comes handy after all.</p>';

        let btnSaveDiagram = (
            <button type='button' className='saveDiagramButton btn btn-primary'
                    onClick={this.props.onSaveDiagram}>
                <span className='glyphicon glyphicon-save'/> Save diagram
            </button>
        );

        let btnEditAtMainSite = (
            <button type='button' className='btn btn-primary' onClick={this.props.onEditAtMainSite}>
                Edit in <img src='images/ontodia_headlogo.png' height='15.59'/>
            </button>
        );

        let btnShare = (
            <button type='button' className='btn btn-default'
                    title='Publish or share diagram' onClick={this.props.onShare}>
                <span className='glyphicon glyphicon-user'/> Share
            </button>
        );

        let btnHelp = (
            <button type='button' className='btn btn-default'
                    onClick={this.props.onShowTutorial}>
                <span className='glyphicon glyphicon-question-sign'/> Help
            </button>
        );

        const nonEmbedded = !this.props.isEmbeddedMode;
        return (
            <div className='ontodia-toolbar'>
                <div className='btn-group btn-group-sm'
                     data-position='bottom' data-step='6' data-intro={intro}>
                    {nonEmbedded
                        ? (this.props.onSaveDiagram ? btnSaveDiagram : undefined)
                        : (this.props.onEditAtMainSite ? btnEditAtMainSite : undefined)}
                    {this.props.onSaveToSelf ? (
                        <button type='button' class='btn btn-default'>
                            <span class='glyphicon glyphicon-save'></span> Save under your account
                        </button>
                    ) : undefined}
                    {(this.props.isDiagramSaved && this.props.onResetDiagram) ? (
                        <button type='button' class='btn btn-default'>
                            <span class='glyphicon glyphicon-repeat'></span> Reset
                        </button>
                    ) : undefined}
                    <button type='button' className='btn btn-default'
                            onClick={this.props.onForceLayout}>
                        <span className='glyphicon glyphicon-tree-conifer'/> Layout
                    </button>
                    <button type='button' className='btn btn-default'
                            title='Zoom In' onClick={this.props.onZoomIn}>
                        <span className='glyphicon glyphicon-zoom-in'/>
                    </button>
                    <button type='button' className='btn btn-default'
                            title='Zoom Out' onClick={this.props.onZoomOut}>
                        <span className='glyphicon glyphicon-zoom-out'/>
                    </button>
                    <button type='button' className='btn btn-default'
                            title='Fit to Screen' onClick={this.props.onZoomToFit}>
                        <span className='glyphicon glyphicon-fullscreen'/>
                    </button>
                    {(nonEmbedded && this.props.onUndo) ? (
                        <button type='button' className='btn btn-default ontodia-toolbar__undo'
                            title='Undo' onClick={this.props.onUndo}>
                            <span className='glyphicon glyphicon-arrow-left'/>
                        </button>
                    ) : undefined}
                    {(nonEmbedded && this.props.onRedo) ? (
                        <button type='button' className='btn btn-default ontodia-toolbar__redo'
                            title='Redo' onClick={this.props.onRedo}>
                            <span className='glyphicon glyphicon-arrow-right'/>
                        </button>
                    ) : undefined}
                    <button type='button' className='btn btn-default'
                            title='Export diagram as PNG' onClick={this.onExportPNG}>
                        <span className='glyphicon glyphicon-picture'/> PNG
                    </button>
                    <button type='button' className='btn btn-default'
                            title='Export diagram as SVG' onClick={this.onExportSVG}>
                        <span className='glyphicon glyphicon-picture'/> SVG
                    </button>
                    <button type='button' className='btn btn-default'
                            title='Print diagram' onClick={this.props.onPrint}>
                        <span className='glyphicon glyphicon-print'/>
                    </button>
                    {(nonEmbedded && this.props.onShare) ? btnShare : undefined}
                    <div className='btn-group languageSelector'>
                        {nonEmbedded ? <label><span>Ontology Language:</span></label> : undefined}
                        <select defaultValue='en' onChange={this.onChangeLanguage}>
                            <option value='en'>English</option>
                            <option value='ru'>Russian</option>
                        </select>
                    </div>
                    {nonEmbedded ? btnHelp : undefined}
                </div>
                <a href='#' ref={link => { this.downloadImageLink = link; }}
                   style={{display: 'none', visibility: 'collapse'}}/>
            </div>
        );
    }
}

export default EditorToolbar;
