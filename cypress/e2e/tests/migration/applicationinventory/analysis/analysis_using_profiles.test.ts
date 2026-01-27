/*
Copyright © 2021 the Konveyor Contributors (https://konveyor.io/)

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/
/// <reference types="cypress" />

import * as data from "../../../../../utils/data_utils";
import {
  checkSuccessAlert,
  deleteAllCredentials,
  deleteBulkApplicationsByApi,
  getRandomAnalysisData,
  getRandomApplicationData,
  login,
} from "../../../../../utils/utils";
import { CredentialsMaven } from "../../../../models/administration/credentials/credentialsMaven";
import { CredentialsSourceControlUsername } from "../../../../models/administration/credentials/credentialsSourceControlUsername";
import { AnalysisProfile } from "../../../../models/migration/analysis-profiles/analysis-profile";
import { Analysis } from "../../../../models/migration/applicationinventory/analysis";
import {
  AnalysisStatuses,
  CredentialType,
  MIN,
  UserCredentials,
} from "../../../../types/constants";
import * as commonView from "../../../../views/common.view";

let sourceCredential: CredentialsSourceControlUsername;
let mavenCredential: CredentialsMaven;
const applicationIds: number[] = [];

describe(["@tier1"], "Analysis using profiles", () => {
  before("Login and setup credentials", function () {
    login();
    cy.visit("/");
    deleteAllCredentials();

    // Create source Credentials
    sourceCredential = new CredentialsSourceControlUsername(
      data.getRandomCredentialsData(
        CredentialType.sourceControl,
        UserCredentials.usernamePassword,
        true
      )
    );
    sourceCredential.create();

    // Create Maven credentials
    mavenCredential = new CredentialsMaven(
      data.getRandomCredentialsData(CredentialType.maven, null, true)
    );
    mavenCredential.create();
  });

  beforeEach("Load data", function () {
    cy.fixture("application").then(function (appData) {
      this.appData = appData;
    });
    cy.fixture("analysis").then(function (analysisData) {
      this.analysisData = analysisData;
    });

    // Interceptors
    cy.intercept("POST", "/hub/application*").as("postApplication");
    cy.intercept("GET", "/hub/application*").as("getApplication");
    cy.intercept("DELETE", "/hub/application*").as("deleteApplication");
    cy.visit("/");
  });

  it("Create analysis profile and run analysis using that profile", function () {
    const profileName = `profile-${data.getRandomNumber()}`;
    const profileDescription = data.getDescription();
    const profileData = getRandomAnalysisData(
      this.analysisData["source+dep_analysis_on_tackletestapp"]
    );

    // Step 1: Create an analysis profile
    const analysisProfile = new AnalysisProfile(
      profileName,
      profileData,
      profileDescription
    );

    analysisProfile.create();

    // Step 2: Create an application with the profile
    profileData.profileName = profileName;

    const application = new Analysis(
      getRandomApplicationData("tackleTestApp_Profile_Analysis", {
        sourceData: this.appData["tackle-testapp-git"],
      }),
      profileData
    );

    application.create();
    cy.wait("@getApplication");
    application.extractIDfromName().then((id) => {
      applicationIds.push(id);
    });

    // Step 3: Run analysis using the profile
    application.analyze();
    application.waitStatusChange(AnalysisStatuses.scheduled);

    // Step 4: Verify analysis completes successfully
    application.verifyAnalysisStatus(AnalysisStatuses.completed, 30 * MIN);

    // Step 5: Verify effort matches expected value
    application.verifyEffort(
      this.analysisData["source+dep_analysis_on_tackletestapp"]["effort"]
    );

    // Clean up: Delete the profile
    analysisProfile.delete();
  });

  after("Perform test data clean up", function () {
    deleteBulkApplicationsByApi(applicationIds);
    sourceCredential.delete();
    mavenCredential.delete();
  });
});
