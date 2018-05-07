import * as React from 'react';

import { WorkspaceLanguage } from './workspace';

export interface ToolbarProps {
    onSaveDiagram?: () => void;
    onForceLayout?: () => void;
    onZoomIn?: () => void;
    onZoomOut?: () => void;
    onZoomToFit?: () => void;
    onExportSVG?: (fileName?: string) => void;
    onExportPNG?: (fileName?: string) => void;
    onPrint?: () => void;
    languages?: ReadonlyArray<WorkspaceLanguage>;
    selectedLanguage?: string;
    onChangeLanguage?: (language: string) => void;
    onShowTutorial?: () => void;
    hidePanels?: boolean;
    isLeftPanelOpen?: boolean;
    onLeftPanelToggle?: () => void;
    isRightPanelOpen?: boolean;
    onRightPanelToggle?: () => void;
}

const CLASS_NAME = 'ontodia-toolbar';

export class DefaultToolbar extends React.Component<ToolbarProps, {}> {
    private onChangeLanguage = (event: React.SyntheticEvent<HTMLSelectElement>) => {
        const value = event.currentTarget.value;
        this.props.onChangeLanguage(value);
    }

    private onExportSVG = () => {
        this.props.onExportSVG();
    }

    private onExportPNG = () => {
        this.props.onExportPNG();
    }

    private renderBtnSaveDiagram = () => {
        if (!this.props.onSaveDiagram) { return null; }

        return (
            <button type='button' className='saveDiagramButton ontodia-btn ontodia-btn-primary'
                    onClick={this.props.onSaveDiagram}>
                <span className='fa fa-floppy-o' aria-hidden='true' /> Save diagram
            </button>
        );
    }

    private renderBtnHelp = () => {
        if (this.props.hidePanels) { return null; }

        return (
            <button type='button' className='ontodia-btn ontodia-btn-default'
                    onClick={this.props.onShowTutorial}>
                <span className='fa fa-info-circle' aria-hidden='true' /> Help
            </button>
        );
    }

    private renderLanguages = () => {
        const {selectedLanguage, languages} = this.props;

        if (languages.length <= 1) { return null; }

        return (
            <span className={`ontodia-btn-group ${CLASS_NAME}__language-selector`}>
                <label className='ontodia-label'><span>Data Language - </span></label>
                <select value={selectedLanguage} onChange={this.onChangeLanguage}>
                    {languages.map(({code, label}) => <option key={code} value={code}>{label}</option>)}
                </select>
            </span>
        );
    }

    private renderButtonsTogglePanels = () => {
        const {
            hidePanels,
            isLeftPanelOpen,
            onLeftPanelToggle,
            isRightPanelOpen,
            onRightPanelToggle
        } = this.props;

        if (hidePanels) { return null; }

        const className = `ontodia-btn ontodia-btn-default ${CLASS_NAME}__toggle`;

        return (
            <div className='ontodia-btn-group ontodia-btn-group-sm'>
                <button type='button'
                        className={`${className} ${CLASS_NAME}__toggle-left ${isLeftPanelOpen ? 'active' : ''}`}
                        onClick={onLeftPanelToggle}
                        title='Classes Panel'/>
                <button type='button'
                        className={`${className} ${CLASS_NAME}__toggle-right ${isRightPanelOpen ? 'active' : ''}`}
                        onClick={onRightPanelToggle}
                        title='Connections Panel'/>
            </div>
        );
    }

    render() {
        const intro = '<h4>Toolbox</h4>' +
            '<p>You can use additional tools for working with your diagram, such as choosing between automatic ' +
            'layouts or fit diagram to screen, etc.</p>' +
            '<p>Don’t forget to save diagrams, it always comes handy after all.</p>';

        return (
            <div className={CLASS_NAME}>
                <div className='ontodia-btn-group ontodia-btn-group-sm'
                     data-position='bottom' data-step='6' data-intro={intro}>
                    {this.renderBtnSaveDiagram()}
                    <button type='button' className='ontodia-btn ontodia-btn-default'
                            title='Force layout' onClick={this.props.onForceLayout}>
                        <span className='fa fa-sitemap' aria-hidden='true'/> Layout
                    </button>
                    <button type='button' className='ontodia-btn ontodia-btn-default'
                            title='Zoom In' onClick={this.props.onZoomIn}>
                        <span className='fa fa-search-plus' aria-hidden='true'/>
                    </button>
                    <button type='button' className='ontodia-btn ontodia-btn-default'
                            title='Zoom Out' onClick={this.props.onZoomOut}>
                        <span className='fa fa-search-minus' aria-hidden='true'/>
                    </button>
                    <button type='button' className='ontodia-btn ontodia-btn-default'
                            title='Fit to Screen' onClick={this.props.onZoomToFit}>
                        <span className='fa fa-arrows-alt' aria-hidden='true'/>
                    </button>
                    <button type='button' className='ontodia-btn ontodia-btn-default'
                            title='Export diagram as PNG' onClick={this.onExportPNG}>
                        <span className='fa fa-picture-o' aria-hidden='true'/> PNG
                    </button>
                    <button type='button' className='ontodia-btn ontodia-btn-default'
                            title='Export diagram as SVG' onClick={this.onExportSVG}>
                        <span className='fa fa-picture-o' aria-hidden='true'/> SVG
                    </button>
                    <button type='button' className='ontodia-btn ontodia-btn-default'
                            title='Print diagram' onClick={this.props.onPrint}>
                        <span className='fa fa-print' aria-hidden='true'/>
                    </button>
                    {this.renderLanguages()}
                    {this.renderBtnHelp()}
                </div>
                {this.renderButtonsTogglePanels()}
            </div>
        );
    }
}
