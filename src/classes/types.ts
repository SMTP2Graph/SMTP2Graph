
export type JsonMailSchema = {
    message: {
        subject: string;
        body: {
            contentType: 'HTML' | 'Text';
            content: string;
        };
        from: {
            emailAddress: {
                address: string;
            };
        };
        toRecipients?: {
            emailAddress: {
                address: string;
            };
        }[];
        ccRecipients?: {
            emailAddress: {
                address: string;
            };
        }[];
        bccRecipients?: {
            emailAddress: {
                address: string;
            };
        }[];
        attachments?: {
            "@odata.type": "#microsoft.graph.fileAttachment";
            name: string;
            contentBytes: string;
            contentType: string;
        }[];
    }
};

export type MetaData = {
    allRecipients: string[];
};
