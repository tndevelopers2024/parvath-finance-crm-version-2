import { Link, useParams } from "react-router-dom";
import {
  CalendarDays,
  Check,
  MessageCircle,
  PackagePlus,
  UserRound,
} from "lucide-react";
import { useData } from "./api";

export default function ClientSuccess() {
  const { id } = useParams();
  const client = useData("/clients/" + id, !!id);
  const name = client.data?.data?.name || "Your client";
  return (
    <div className="onboard-success-page">
      <div className="onboard-confetti" aria-hidden="true" />
      <div className="onboard-success-card">
        <div className="onboard-success-icon">
          <Check size={38} />
        </div>
        <h1>Client Added Successfully!</h1>
        <p>
          <strong>{name}</strong> has been added to your Parvath FinServ client
          database.
        </p>
        <div className="onboard-success-actions">
          <Link to={`/clients/${id}`}>
            <UserRound size={23} />
            View Client Profile
          </Link>
          <Link to={`/products/new?clientId=${id}`}>
            <PackagePlus size={23} />
            Add policy / account
          </Link>
          <Link to={`/followups/new?clientId=${id}`}>
            <CalendarDays size={23} />
            Schedule Follow-up
          </Link>
          <Link to={`/engagement/new?clientId=${id}`}>
            <MessageCircle size={23} />
            Send WhatsApp
          </Link>
        </div>
        <Link className="onboard-another" to="/clients/new">
          Add Another Client
        </Link>
      </div>
    </div>
  );
}
