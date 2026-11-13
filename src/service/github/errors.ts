import { Logger } from "../../logger";

/** HTTP status of a failed requestUrl call: on the error object, or only in its message. */
export function githubErrorStatus(err: unknown): number | undefined {
	const status = (err as { status?: unknown } | null)?.status;
	if (typeof status === "number") return status;
	const match = /status (\d{3})/i.exec(Logger.getErrorMessage(err));
	return match ? Number(match[1]) : undefined;
}

/**
 * Turns a failed GitHub request into a message that says what to fix.
 * @param action What was being done, e.g. "Listing releases of owner/repo".
 * @param authed Whether the request carried a PAT.
 * @param notFound Which 404 hint applies: a missing or hidden repo, a missing tag/branch, or a missing folder/file.
 */
export function describeGitHubError(
	err: unknown,
	action: string,
	authed: boolean,
	notFound: "repo" | "ref" | "path",
): string {
	const status = githubErrorStatus(err);
	let hint: string;
	if (status === 401) {
		hint = "GitHub rejected the PAT. It may be expired or revoked.";
	} else if (status === 403) {
		hint = authed
			? "The PAT may lack access to this repo, or the API rate limit was hit."
			: "The limit for requests without a PAT (60 per hour) may be used up. Pick a PAT and try again.";
	} else if (status === 404 && notFound === "path") {
		hint = "The folder or file was not found on that branch. Check the pull rule's folder and defaultBranch in the dashboard.";
	} else if (status === 404 && notFound === "ref") {
		hint =
			"The tag or the branch was not found. Check defaultBranch in the dashboard, and whether the latest release is a draft whose tag does not exist yet.";
	} else if (status === 404) {
		hint = authed
			? "The repo does not exist, or the PAT cannot see it. Check repo (owner/name) in the dashboard."
			: "The repo does not exist or is private. For a private repo, untick Public and pick a PAT.";
	} else {
		hint = Logger.getErrorMessage(err);
	}
	return status ? `${action} failed (${status}): ${hint}` : `${action} failed: ${hint}`;
}
