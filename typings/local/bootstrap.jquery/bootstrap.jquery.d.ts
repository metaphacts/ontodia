interface JQuery {
	/**
	 * Shows or hides a modal dialog
	 **/
	modal(showOrHide: string): void;
	modal(options: {
    	backdrop: string;
        keyboard: boolean;
        show: boolean;
    }): void;
	
	serializeObject(): any;
	deserialize(data: any): void;
	
	fileupload(options: {
		url: string;
        dataType: string;
        done: (e: any, data: any) => void;
        progressall: (e: any, data: any) => void;
        start: (e: any, data: any) => void;
        onRemove: (id: string) => void;
	}): JQuery;
}

interface JQuerySupport {
	fileInput?: boolean;
}
