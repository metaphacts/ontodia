import * as React from 'react';

export enum ProgressState {
    none = 'none',
    loading = 'loading',
    error = 'error',
    completed = 'completed',
}

export interface ProgressBarProps {
    state: ProgressState;
    percent?: number;
    height?: number;
}

const CLASS_NAME = 'ontodia-progress-bar';

export class ProgressBar extends React.Component<ProgressBarProps, {}> {
    render() {
        const {state, percent = 100, height = 20} = this.props;
        const className = `${CLASS_NAME} ${CLASS_NAME}--${state}`;
        const showBar = state === ProgressState.loading || state === ProgressState.error;
        return (
            <div className={className} style={{height: showBar ? height : 0}}>
                <div className={`${CLASS_NAME}__bar`} role='progressbar'
                    style={{width: `${percent}%`}}
                    aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
                </div>
            </div>
        );
    }
}
