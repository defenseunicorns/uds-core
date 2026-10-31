// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package v1alpha1
import("encoding/json";"testing")
func TestEmptyAuthserviceSelectorSurvivesTypedFinalizerUpdate(t *testing.T){
 var pkg UDSPackage
 if err:=json.Unmarshal([]byte(`{"spec":{"sso":[{"clientId":"wide","name":"Wide","enableAuthserviceSelector":{}}],"network":{"expose":[{"protocol":"UDP","service":"echo","port":8000}]}}}`),&pkg);err!=nil{t.Fatal(err)}
 pkg.Finalizers=[]string{"pepr.dev/finalizer"}
 data,err:=json.Marshal(pkg);if err!=nil{t.Fatal(err)}
 var roundTrip UDSPackage;_=json.Unmarshal(data,&roundTrip)
 if roundTrip.Spec.Sso[0].EnableAuthserviceSelector==nil{t.Fatal("typed metadata update disabled namespace-wide authservice selector")}
 if roundTrip.Spec.Network.Expose[0].Protocol==nil || *roundTrip.Spec.Network.Expose[0].Protocol!=ExposeUDP{t.Fatal("current UDP schema field disappeared")}
}
